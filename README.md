# Trợ lý Báo cáo Can thiệp

Ứng dụng React/Vite ưu tiên điện thoại, cung cấp một khung chat duy nhất để tạo báo cáo đánh giá chức năng và kế hoạch can thiệp bằng AI.

## Chạy cục bộ

1. Chạy `npm install`.
2. Chạy `npm run dev`.
3. Mở **Cài đặt**, nhập khóa OpenRouter (mặc định chỉ trong phiên) và gửi dữ liệu có tên trẻ, ngày sinh, người đánh giá và dữ liệu nguồn.

Không đưa khóa thật vào `.env` hoặc Git. Có thể chọn chế độ Cloudflare Worker bằng cách đổi địa chỉ API trong Cài đặt.

## Kiểm tra và triển khai

`npm run check`, `npm test`, và `npm run build` kiểm tra kiểu, Rule Engine, và bản phát hành. Workflow GitHub Pages nằm tại `.github/workflows/deploy.yml`; hãy bật Pages với nguồn **GitHub Actions**. Nếu tên repository khác `bao-cao-can-thiep`, cập nhật `base` trong `vite.config.ts`.

## Lưu ý

Dữ liệu được lưu cục bộ trong trình duyệt. Không có tài khoản, máy chủ dữ liệu, PDF hay đồng bộ đám mây. Giao diện có thể chạy với dữ liệu thật; không có dữ liệu giả được đưa vào báo cáo.
