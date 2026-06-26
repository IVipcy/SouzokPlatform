"""郵送書類確認票テンプレから未使用の外部参照(externalLinks)を削除する。

ExcelJS は load → writeBuffer で externalLinks を保持できず、出力xlsxが破損する
（Excelで「一部の内容に問題が見つかりました」→「回復」しても空になる現象）。
sheet1.xml に外部参照を使う数式は存在しない（grep済）ため、安全に剥がせる。

剥がすもの:
  - xl/externalLinks/externalLink1.xml, externalLink2.xml と _rels/*.rels
  - [Content_Types].xml の externalLink override エントリ
  - xl/_rels/workbook.xml.rels の externalLink リレーション
  - xl/workbook.xml の <externalReferences> ブロック
"""
import os
import re
import shutil
import zipfile

SRC = 'public/templates/mailing-confirmation/mailing_confirmation.xlsx'
TMP = SRC + '.cleaning'
BAK = SRC + '.bak'

def strip(path: str) -> tuple[str, set[str]]:
    """zip を読み、externalLinks を取り除いた新しい parts dict を返す。"""
    with zipfile.ZipFile(path) as z:
        parts = {n: z.read(n) for n in z.namelist()}

    removed: set[str] = set()
    # 1) externalLinks/ 配下を削除
    for name in list(parts.keys()):
        if name.startswith('xl/externalLinks/'):
            removed.add(name)
            del parts[name]

    # 2) workbook.xml.rels から externalLink リレーションを削除
    rels_key = 'xl/_rels/workbook.xml.rels'
    if rels_key in parts:
        rels = parts[rels_key].decode('utf-8')
        rels = re.sub(r'<Relationship[^/]*Type="[^"]*externalLink[^"]*"[^/]*/>', '', rels)
        parts[rels_key] = rels.encode('utf-8')

    # 3) [Content_Types].xml から externalLink Override を削除
    ct_key = '[Content_Types].xml'
    if ct_key in parts:
        ct = parts[ct_key].decode('utf-8')
        ct = re.sub(r'<Override[^/]*PartName="/xl/externalLinks/[^"]*"[^/]*/>', '', ct)
        parts[ct_key] = ct.encode('utf-8')

    # 4) workbook.xml の <externalReferences> ブロックを削除
    wb_key = 'xl/workbook.xml'
    if wb_key in parts:
        wb = parts[wb_key].decode('utf-8')
        wb = re.sub(r'<externalReferences>.*?</externalReferences>', '', wb, flags=re.DOTALL)
        parts[wb_key] = wb.encode('utf-8')

    return parts, removed


def write(parts: dict, dst: str) -> None:
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)


def main() -> None:
    if not os.path.exists(SRC):
        raise SystemExit(f'not found: {SRC}')
    parts, removed = strip(SRC)
    print('removed parts:')
    for n in sorted(removed):
        print(' ', n)
    # バックアップ→差し替え
    if not os.path.exists(BAK):
        shutil.copy2(SRC, BAK)
        print(f'backup: {BAK}')
    write(parts, TMP)
    shutil.move(TMP, SRC)
    print(f'cleaned: {SRC}')


if __name__ == '__main__':
    main()
