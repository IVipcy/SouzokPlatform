// 享年（生年月日→死亡日）。面談シート・面談結果登録・実務タブで同じ計算を使う。どちらか欠けたら null。
export function ageAtDeath(birthday: string | null | undefined, deathDate: string | null | undefined): number | null {
  if (!birthday || !deathDate) return null
  const b = new Date(birthday), d = new Date(deathDate)
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null
  let age = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
  return age >= 0 ? age : null
}
