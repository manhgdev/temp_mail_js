# TODO

## Mục tiêu hiện tại

- Chốt vòng frontend hiện tại sau đợt refactor `public/`
- Giữ UI đồng bộ giữa `index`, `login`, `forgot-password`, `app`, `submit-domain`
- Không làm thay đổi contract backend nếu không thực sự cần

## Ưu tiên cao

- Rà lại toàn bộ `/app` khi đổi ngôn ngữ
  - guest mode
  - logged-in mode
  - placeholder text
  - sidebar empty state
  - button labels
- Rà lại toàn bộ `/app` responsive
  - navbar
  - sidebar / main split
  - footer
  - theme button
- Kiểm tra `/forgot-password`
  - gửi reset mail thành công
  - lỗi email không hợp lệ
  - lỗi too many requests
  - copy EN/VI

## UI/Auth

- Kiểm tra lại flow guest của `/app`
  - vào `/app` không redirect sang `/login`
  - `Create` ở sidebar redirect sang register đúng
  - `Log in` ở topbar và placeholder redirect đúng
- Rà lại `/login`
  - tab login/register
  - Google sign-in
  - link `Forgot password?`
- Rà lại `/forgot-password`
  - topbar
  - spacing
  - alert success/error
  - `Back to login`

## Ngôn ngữ / copy

- Chuẩn hóa wording giữa:
  - `email`
  - `mail`
  - `inbox`
- Kiểm tra lại các text guest-state ở `/app`
- Kiểm tra lại các text footer ở tất cả page public

## Backend / config

- Kiểm tra lại `/firebase/config`
  - `is_production`
  - `app_inbox_page_size`
- Kiểm tra env đang dùng đúng:
  - `ANYMOUSE_INBOX_PAGE_SIZE`
  - `APP_INBOX_PAGE_SIZE`
  - `GENERATE_RATE_LIMIT_MAX`
  - `GENERATE_RATE_LIMIT_WINDOW_SECONDS`

## Kiểm thử thủ công

- `/`
  - tạo inbox
  - refresh
  - auto-refresh
  - mở mail
  - xóa mail
- `/login`
  - login email/password
  - register
  - Google sign-in
- `/forgot-password`
  - gửi reset link
- `/app`
  - guest state
  - login xong quay lại app
  - tạo inbox
  - load mail
  - modal mail
  - auto-refresh không phá UI
  - logout về guest state
- `/submit-domain`
- `/admin`
- `/privacy`

## Dọn repo

- Dọn CSS/JS thừa sau đợt chỉnh UI
- Rà lại cache-busting version trong HTML
- Giữ `README.md` đồng bộ nếu flow auth hoặc route thay đổi tiếp
