# Fonts for build-time rendering

`JulefletSans-Regular.ttf` and `JulefletSans-Bold.ttf` are used by
`scripts/generate-heart-data.mjs` to draw the text on the Open Graph images
(`static/og/<id>.png`). Vendoring them makes the images identical on every
machine and in CI instead of depending on whatever system fonts are installed.

They are a subset of **Liberation Sans 2.1.5** (Regular and Bold), licensed under
the SIL Open Font License 1.1 (see `LICENSE-OFL-1.1.txt`). The subset keeps
Basic Latin, Latin-1 Supplement (æ ø å Æ Ø Å and friends), a few Latin
Extended-A letters, typographic dashes and quotes, the ellipsis and the euro
sign, with hinting removed. Because a subset counts as a Modified Version and
"Liberation" is a Reserved Font Name under the OFL, the family is renamed
"Juleflet Sans"; the original copyright notice is kept in the font's name table.

To regenerate (needs Python with `fonttools`):

```sh
curl -L -o liberation.tar.gz \
  https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz
tar xzf liberation.tar.gz
for style in Regular Bold; do
  pyftsubset liberation-fonts-ttf-2.1.5/LiberationSans-$style.ttf \
    --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+2013-2014,U+2018-201A,U+201C-201E,U+2026,U+20AC" \
    --no-hinting --desubroutinize --layout-features=kern,liga --name-IDs='*' --name-legacy \
    --output-file=JulefletSans-$style.ttf
done
# then rename name IDs 0, 1, 3, 4, 6 and 16 to the "Juleflet Sans" family with fontTools.ttLib
```
