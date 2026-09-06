// PostCSS pipeline for `T-01.5` (SPEC-003 s3.3 "Estilo", DoD D1.8) -- `I-8` (`DESIGN_SYSTEM.md`
// s9.1, gates/F1-design.md): Tailwind v4 as the mechanism the `frontend-architect`/`ui-designer`
// pair inferred. Single plugin -- Tailwind v4 ships its own vendor prefixing and import
// resolution, so no `autoprefixer`/`postcss-import` is added on top.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
