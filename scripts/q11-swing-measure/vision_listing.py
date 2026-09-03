"""Paginated listing of data.binance.vision (S3) with sizes per year. Usage: python3 vision_listing.py <prefix>..."""
import urllib.request, re, sys, collections
BASE="https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix="
def listing(prefix):
    keys=[]; marker=""
    while True:
        url=BASE+prefix+(f"&marker={marker}" if marker else "")
        x=urllib.request.urlopen(url,timeout=30).read().decode()
        for k,s in re.findall(r"<Key>([^<]+)</Key>.*?<Size>(\d+)</Size>",x):
            if not k.endswith("CHECKSUM"): keys.append((k,int(s)))
        if "<IsTruncated>true</IsTruncated>" not in x: break
        marker=re.findall(r"<Key>([^<]+)</Key>",x)[-1]
    return keys
for prefix in sys.argv[1:]:
    ks=listing(prefix)
    by=collections.defaultdict(lambda:[0,0])
    for k,s in ks:
        mm=re.search(r"(\d{4})-\d{2}",k); y=mm.group(1) if mm else "other"; by[y][0]+=1; by[y][1]+=s
    print(f"== {prefix} files={len(ks)} total_bytes={sum(s for _,s in ks):,} first={ks[0][0].split('/')[-1]} last={ks[-1][0].split('/')[-1]}")
    for y in sorted(by): print(f"   {y}: files={by[y][0]} bytes={by[y][1]:,}")
