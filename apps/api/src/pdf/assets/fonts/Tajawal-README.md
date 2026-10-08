# Tajawal Arabic typography

Regular and Bold are the unmodified static fonts from Google Fonts:
https://github.com/google/fonts/tree/main/ofl/tajawal

Copyright 2018 Boutros International. SIL Open Font License 1.1 is included in
Tajawal-OFL.txt. The licence permits web distribution and PDF embedding.
Web WOFF files are generated from these TTF files using fontTools without changing
outlines, naming, weights or character mapping. Keep the licence alongside both.

The consultation renderer uses genuine 400/700 faces. Arabic joining is performed
by fontkit; the version-guarded textkit cluster patch remains required. Do not use
presentation-form substitutions. LRM boundaries preserve Latin identifiers inside
Arabic text. Arabic paragraphs must set direction: rtl, rather than only textAlign: right (LRI/PDI glyphs are not reliably hidden by the current renderer).

Before changing fonts or the renderer, run scripts/verify-treatment-proposals.cjs
and inspect the rendered Arabic specimens, including bold, diacritics and mixed
references/phone numbers. Noto Sans Arabic was evaluated but was incompatible with
the current textkit cluster handling; changing only the family name was insufficient.
Nest copies pdf/assets/**/* into the API build; verify both TTF files in dist.
