# TODO

## Mục tiêu hiện tại

- Ổn định lại toàn bộ frontend sau đợt refactor `public/`
- Đồng bộ UI/theme giữa các trang public chính
- Giữ nguyên behavior backend hiện có, chỉ sửa khi ảnh hưởng trực tiếp đến UI flow

## Ưu tiên cao

- Rà lại trang `app` sau khi chuyển mail viewer sang modal:
  - kiểm tra auto-refresh không làm mất modal đang mở
  - kiểm tra modal hoạt động đúng với mail HTML, mail text, attachments
  - kiểm tra xóa mail / xóa toàn bộ mail / đổi inbox khi đang mở modal
- Chuẩn hóa topbar giữa `login`, `app`, `submit-domain`, `index`
- Kiểm tra lại language switcher trên các trang đa ngôn ngữ:
  - `/`
  - `/login`
  - `/app`
  - `/submit-domain`
- Dọn CSS trùng hoặc thừa sau khi refactor:
  - `public/css/pages/app.css`
  - `public/css/pages/login.css`
  - `public/css/pages/home.css`
- Kiểm tra lại toàn bộ asset path sau khi chuyển sang cấu trúc:
  - `public/pages/*`
  - `public/css/*`
  - `public/js/*`
  - `public/images/*`

## Frontend backlog

- Đồng bộ visual system cho các page public:
  - spacing
  - button styles
  - card styles
  - form styles
  - topbar behavior
- Rà lại responsive cho:
  - `index`
  - `login`
  - `app`
  - `submit-domain`
  - `admin`
  - `privacy`
- Gộp bớt style/page rule nếu đang bị lặp giữa `shells` và `pages`
- Quyết định giữ hay bỏ file `public/css/pages/privacy-page.css` nếu không còn dùng
- Tách rõ phần CSS modal mail dùng chung nếu sau này `index` và `app` cần share cùng component

## Backend / integration backlog

- Rà lại route map trong `src/servers/http.js` để chắc chắn không còn path cũ bị bỏ sót
- Kiểm tra lại `GET /firebase/config` với `login`, `app`, `admin`
- Rà lại ownership check giữa anonymous inbox và user-owned inbox để tránh regression sau các thay đổi UI
- Kiểm tra rate limit cho:
  - `GET /generate`
  - `POST /user/inboxes`
  - `POST /dev/send-test-mail`
- Xem lại logging ở các flow lỗi chính:
  - load mail
  - SMTP ingest
  - domain moderation
  - Firebase config missing

## Tài liệu cần giữ đồng bộ

- `README.md`
- `TODO.md`
- các báo cáo phân tích ngoài repo nếu vẫn còn được dùng làm tài liệu làm việc

## Checklist kiểm thử thủ công

- `/` tạo inbox và đọc mail bình thường
- `/` mở mail bằng modal bình thường
- `/login` đăng nhập email/password bình thường
- `/login` đăng nhập Google bình thường
- `/app` tạo inbox user bình thường
- `/app` list inbox, load mail, mở mail bằng modal bình thường
- `/app` auto-refresh không làm hỏng mail đang xem
- `/submit-domain` submit domain bình thường
- `/admin` đăng nhập và quản lý domain bình thường
- `/privacy` mở đúng, không lỗi asset
- không còn 404 cho CSS/JS/image/font

## Dọn repo

- Xóa file cũ không còn dùng sau refactor public
- Rà lại ảnh preview trong `preview/`
- Cân nhắc thêm script kiểm tra nhanh asset/page path nếu còn tiếp tục refactor frontend
