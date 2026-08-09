export const metadata = {
  title: '부모님 루틴 관리',
  description: '부모님 안심 루틴 서비스',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
