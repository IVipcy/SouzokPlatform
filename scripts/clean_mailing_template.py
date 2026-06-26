"""郵送書類確認票テンプレを Excel が文句を言わない構造にクリーンアップする。

剥がす/直すもの:
  1) xl/externalLinks/ 配下（過去にExcelで外部参照を使った残骸。実数式での参照は0個）
  2) [Content_Types].xml / xl/_rels/workbook.xml.rels / xl/workbook.xml から
     externalLink 関連の Override / Relationship / <externalReferences> を除去
  3) xl/worksheets/sheet1.xml に XML 宣言 <?xml ...?> を付与（欠落してた）
  4) sheet1.xml の <dataValidations> ブロックを除去
     （元は外部参照プルダウン。剥がした結果 $N$23:$N$26 等の空範囲を指してゴミ化）

ExcelJS は通さない。zip 構造そのまま、必要な XML だけ書き換える。
出力テンプレを再実行で何度生成しても結果は同じ（冪等）。
"""
import os
import re
import shutil
import zipfile

SRC = 'public/templates/mailing-confirmation/mailing_confirmation.xlsx'
TMP = SRC + '.cleaning'
BAK = SRC + '.bak'

XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'


def clean(src: str) -> tuple[dict, list[str]]:
    with zipfile.ZipFile(src) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    log: list[str] = []

    # (1) externalLinks 配下
    for name in list(parts.keys()):
        if name.startswith('xl/externalLinks/'):
            del parts[name]
            log.append(f'removed part: {name}')

    # (2) [Content_Types].xml
    ct_key = '[Content_Types].xml'
    if ct_key in parts:
        before = parts[ct_key]
        ct = before.decode('utf-8')
        ct2 = re.sub(r'<Override[^/]*PartName="/xl/externalLinks/[^"]*"[^/]*/>', '', ct)
        if ct != ct2:
            parts[ct_key] = ct2.encode('utf-8')
            log.append('cleaned [Content_Types].xml (externalLink Override)')

    # (2) workbook.xml.rels
    rels_key = 'xl/_rels/workbook.xml.rels'
    if rels_key in parts:
        before = parts[rels_key]
        r = before.decode('utf-8')
        r2 = re.sub(r'<Relationship[^/]*Type="[^"]*externalLink[^"]*"[^/]*/>', '', r)
        if r != r2:
            parts[rels_key] = r2.encode('utf-8')
            log.append('cleaned workbook.xml.rels (externalLink Relationship)')

    # (2) workbook.xml
    wb_key = 'xl/workbook.xml'
    if wb_key in parts:
        before = parts[wb_key]
        wb = before.decode('utf-8')
        wb2 = re.sub(r'<externalReferences>.*?</externalReferences>', '', wb, flags=re.DOTALL)
        if wb != wb2:
            parts[wb_key] = wb2.encode('utf-8')
            log.append('cleaned workbook.xml (<externalReferences>)')

    # (3)+(4) sheet1.xml
    sh_key = 'xl/worksheets/sheet1.xml'
    if sh_key in parts:
        before = parts[sh_key]
        s = before.decode('utf-8')
        changed = False
        # XML 宣言を先頭に付与（既に付いてれば触らない）
        if not s.lstrip().startswith('<?xml'):
            s = XML_DECL + s
            changed = True
            log.append('added XML declaration to sheet1.xml')
        # 孤立した dataValidations を除去
        s2 = re.sub(r'<dataValidations[\s\S]*?</dataValidations>', '', s)
        if s != s2:
            s = s2
            changed = True
            log.append('removed orphaned <dataValidations> from sheet1.xml')
        if changed:
            parts[sh_key] = s.encode('utf-8')

    return parts, log


def write(parts: dict, dst: str) -> None:
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)


def main() -> None:
    if not os.path.exists(SRC):
        raise SystemExit(f'not found: {SRC}')
    parts, log = clean(SRC)
    if not log:
        print('nothing to do (already clean)')
        return
    for line in log:
        print(line)
    if not os.path.exists(BAK):
        shutil.copy2(SRC, BAK)
        print(f'backup: {BAK}')
    write(parts, TMP)
    shutil.move(TMP, SRC)
    print(f'cleaned: {SRC}')


if __name__ == '__main__':
    main()
