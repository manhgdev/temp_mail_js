# TODO

## Ưu tiên hiện tại

- Chốt UI `/admin`
- Rà lại `/app` trên màn hình lớn
- Dọn cấu trúc backend sau đợt thêm admin users / emails / mails

## Admin

- Rà lại toàn bộ `/admin` desktop
  - spacing
  - typography
  - table density
  - modal edit user
- Rà lại `/admin` mobile
  - topbar
  - sidebar drawer
  - bảng domains
  - bảng users / emails / mails
- Làm rõ luồng dữ liệu anonymous trong admin
  - có làm section riêng cho anonymous inboxes hay không
- Kiểm tra lại toàn bộ action admin
  - update user
  - delete user
  - delete one email
  - delete all emails
  - open mail detail
  - domain moderation
- Cân nhắc thêm pagination / search tốt hơn cho:
  - users
  - emails
  - mails

## App

- Rà lại `/app` breakpoint lớn `>= 1440px`
  - container width
  - sidebar width
  - spacing topbar / footer
  - mail modal width
- Kiểm tra lại guest mode của `/app`
  - wording
  - CTA
  - language switcher
- Rà lại copy trong `/app`
  - thống nhất `email`, `mail`, `inbox`

## Auth

- Kiểm tra lại redirect flow sau login
  - từ `/app`
  - từ `/admin`
- Rà lại `/forgot-password`
  - spacing
  - success / error states
  - mobile layout

## Backend

- Dọn lại cấu trúc route anonymous
  - `anonymous.routes.js`
  - `inbox.routes.js`
  - tránh trùng vai trò
- Rà lại lớp service cũ còn chồng chéo
  - `user.service.js`
  - `mail.service.js`
  - `inbox.service.js`
- Kiểm tra hiệu năng các admin query
  - merge Firebase Auth + Firestore
  - cursor pagination
  - total count logic

## Docs

- Giữ `README.md` đồng bộ nếu route hoặc flow admin đổi tiếp
- Cập nhật báo cáo nội bộ nếu cấu trúc backend còn refactor thêm

## Test tay

- `/`
  - generate inbox
  - auto-refresh
  - open mail
  - delete mail
- `/login`
  - login
  - register
  - Google sign-in
- `/forgot-password`
  - request reset mail
- `/app`
  - guest mode
  - create inbox
  - mail modal
  - delete all mails
  - logout
- `/submit-domain`
  - submit domain
- `/admin`
  - overview
  - domains
  - users
  - emails
  - mails
  - edit user popup
  - delete user
  - delete one email
  - delete all emails
- `/privacy`
  - desktop / mobile
