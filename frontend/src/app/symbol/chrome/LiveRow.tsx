import { useEffect, useState } from "react";
import { decodeBucketEnvelope, type LiveBucketEnvelope } from "../../live-transport.ts";

/** One `EventSource`, decoded through `../live-transport.ts` — see this module's own docstring
 * for why this reads "ao vivo indisponível" in this phase (no real producer wired yet). */
function useLiveReadout(url: string | null): string {
  const [text, setText] = useState<string>(url === null ? "sem série resolvida" : "conectando…");

  useEffect(() => {
    if (url === null) {
      return;
    }
    let cancelled = false;
    const source = new EventSource(url);
    source.onmessage = (event) => {
      if (cancelled) {
        return;
      }
      try {
        const envelope: LiveBucketEnvelope = decodeBucketEnvelope(JSON.parse(event.data as string));
        setText(`${envelope.last_price} @ ${envelope.bucket_open_ts} (seq ${envelope.seq})`);
      } catch {
        setText("ao vivo indisponível (envelope inválido)");
      }
    };
    source.onerror = () => {
      if (!cancelled) {
        setText("ao vivo indisponível");
      }
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, [url]);

  return text;
}

/**
 * `T-04.3` (`CST-230`, `SPEC-008`/`D7`, `RF-8`/`RN-5`) — `factKey` and `label` are two DIFFERENT
 * strings on purpose. Before this task the machine key was built from `label` itself
 * (`` `live_${label}:…` ``), so the page published `data-fact="live_preço:attempted"` — an
 * operator's `grep -P '[^\x00-\x7F]'` mordeu on the accent, and worse, renaming the visible word
 * (the `ui-designer`'s call, gated by `ux-ui-mastery`, CLAUDE.md §Design) would have silently
 * renamed the CONTRACT a consumer greps for. `factKey` is ASCII and stable — the property name
 * `liveUrls` already carries (`price`/`oi`/`cvd`, `page.tsx:853-860`) — and never derived from
 * the pt-BR microcopy beside it.
 */
export function LiveRow({
  label,
  factKey,
  url,
}: {
  readonly label: string;
  readonly factKey: string;
  readonly url: string | null;
}) {
  const text = useLiveReadout(url);
  return (
    <li data-fact={`live_${factKey}:${url === null ? "no_series" : "attempted"}`}>
      {label}: {text}
    </li>
  );
}
