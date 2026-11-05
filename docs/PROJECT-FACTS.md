# Personal File Relay 项目事实

维护日期：2026-11-05。用于理解本定制版及核对介绍中的说法；功能变化后应同步更新此文和中英文 README。

| 字段 | 当前事实 |
| --- | --- |
| 项目名称 | Personal File Relay；中文界面名「中转站」 |
| 仓库 | [vence15008-ai/personal-file-relay-public](https://github.com/vence15008-ai/personal-file-relay-public) |
| 可见性 | 公开源码与客户端 Release；每个使用者自行部署并保护自己的主机 |
| 项目定位 | Windows 自托管个人文件、图片与文字中转 |
| 上游基线 | FileBrowser Quantum v2.0.2-stable，非旧版 File Browser 配置 |
| 当前已发布客户端 | [client-v0.1.1](https://github.com/vence15008-ai/personal-file-relay-public/releases/tag/client-v0.1.1)，Windows x64 ZIP |
| 发行源码 | 本公开仓库对应的 Release tag；客户端包内 RELEASE.json 记录源码提交 |
| 服务端 | Go 原生程序；只监听 `127.0.0.1:18473` |
| 公网入口 | 由本人授权 Tailscale Funnel；它提供公网 HTTPS，应用登录保护文件 |
| 前端 | Vue；文件与消息统一列表、剪贴板发送、选择复制、分块上传 |
| Windows 客户端 | .NET Framework 4.8、WinForms、Microsoft Edge WebView2；约 340px 窄窗 |
| 副机 | Windows / Mac / Android 浏览器；Windows 可选原生外壳客户端 |
| Android | 可添加桌面的 Web App；无独立 APK |
| 运行依赖 | 主机无需 Docker、WSL、虚拟机、Go 或 Node.js 运行时；构建工具另需准备 |
| 构建 | Node.js 24、Go 1.27 或以上；客户端使用 .NET Framework 编译器和固定 WebView2 SDK |
| 保存范围 | 专用 Personal 文件源；消息位于 `.text-relay` |
| 安全配置 | 当前部署关闭匿名访问、注册与公开分享；剪贴板仅在明确操作时读取 |
| 许可证 | 仓库 Apache-2.0；WebView2 自带许可和 NOTICE |

## 使用边界

- 定位是个人中转，不提供端到端加密聊天、后台自动剪贴板同步或消息送达保证。
- 自托管的数据仍需独立备份；主机离线时不可访问。
- Windows 11 的模糊效果取决于系统支持；不把所有 Windows 版本都视为已验证。
- 本机隔离测试、实际主机状态、手机异地体验分别记录；不把模拟手机视口当作实体手机。
- 所有数据与验证范围见[验证记录](VALIDATION.md)，操作见[主机指南](../PERSONAL-RELAY.md)和[副机快速开始](../desktop/windows/QUICKSTART.zh-CN.md)。
