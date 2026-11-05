# Windows 窄版客户端

约 340px 宽，默认显示最近 3 条文件 / 消息，列表向下滚动看历史。网页与客户端都没有文字输入框，使用「粘贴并发送」或 Ctrl+V。剪贴板有图片时上传图片，否则发送文字。消息整块点击复制，按钮只留预览 / 删除；文件只留下载 / 预览 / 删除。重命名等完整操作在文件管理中。

界面去掉宣传副标题、刷新、筛选、重复复制按钮和底部长说明。页面使用半透明材质与 32px 背景模糊；Windows 客户端同时使用系统亚克力背景。配色统一为低饱和灰蓝，卡片使用轻描边；Windows 11 隐去外层亮描边，保留圆角与系统阴影。

主界面的 header 与列表共用同一材质，不另设实色标题栏；可拖动标题区，右侧只有热键设置、最小化和关闭到托盘。登录或连接失败时保留原生后备标题栏，方便修改连接设置。

将文件拖入窗口松开即可进入现有上传队列，继续使用 Quantum 的分块上传和冲突处理。当前拖入支持文件；文件夹请使用完整文件管理。拖动文本不会作为文件上传。

## 主机安装

先按 [主机与副机说明](PERSONAL-RELAY.md) 配好原来的文件服务。本客户端使用 Windows 已有的 .NET Framework 4.8 与 Microsoft Edge WebView2 Runtime，不需要 Docker、WSL、虚拟机或 Electron。

在仓库根目录运行：

```powershell
./desktop/windows/build.ps1
./desktop/windows/install.ps1 -Root C:\PersonalFileRelay
```

构建脚本只从官方 NuGet 下载固定版本 Microsoft.Web.WebView2 1.0.4314.35，并核对运行 DLL 的微软 Authenticode 签名。安装只写指定根目录的 client 子目录及本人桌面、开始菜单快捷方式；不改文件服务账号与文件范围，不覆盖同名的其他程序快捷方式。此定制程序为本地源码构建，尚无付费代码签名证书。

打开「中转站」快捷方式，由本人登录。客户端登录会话与普通浏览器各自保存。不会把密码写入配置、命令行或日志；WebView2 管理登录 Cookie。首次登录不能由助手代填真实密码。

如希望一直保留任务栏图标，在运行时右键任务栏中转站图标，选择「固定到任务栏」。点击窗口 × 收到托盘；右键托盘选择「退出客户端」才退出，文件服务继续运行。客户端没有擅自增加开机启动；原文件服务的后台任务保持不变。热键需要客户端正在运行。

## 热键设置

点窗口右上角齿轮，或托盘菜单「热键设置」：

| 操作 | 默认全局热键 |
| --- | --- |
| 显示 / 收起窗口 | Ctrl + Alt + Space |
| 粘贴剪贴板文字 / 图片并发送 | Ctrl + Alt + Enter |
| 选择文件上传 | Ctrl + Alt + U |

点击热键框按新的组合键，也可手动输入。热键需包含 Ctrl 或 Alt；支持 Shift、字母、数字、F1–F24、Space、Enter。拒绝重复、占用及系统保留的组合；配置失败保留原绑定。上传热键打开原生文件选择器，只有本人选中的文件进入原上传队列；不会自动扫描目录。剪贴板只在按下发送热键、点发送按钮或本人 Ctrl+V 时读取；超长或空文字不会发送。发送失败保留待发文字，点击「重试发送」重试。

浏览器图片粘贴支持 PNG、JPEG、WebP、GIF，取决于浏览器剪贴板权限；不支持时可使用上传或拖入。原生热键将系统剪贴板图片编码成 PNG；编码后超过 32MB 时提示使用文件上传，避免在消息通道创建过大的临时副本。文件上传仍支持原来的大文件分块。

连接网址、热键在 `%LOCALAPPDATA%\PersonalFileRelay\Client\settings.json`，没有密码。WebView2 用户资料在同目录的 WebView2 子目录，请勿上传或提交该目录。

## Windows 副机

可直接从本公开仓库的 GitHub Release 下载 `PersonalRelay-Client-*-win-x64.zip`，完整解压后运行 `RelayClient.exe`，无需在副机编译。[副机快速开始](desktop/windows/QUICKSTART.zh-CN.md) 包含填写自己主机网址的方法、系统依赖与更新步骤。

如果副机也想用窄窗，把 build/desktop-client 的程序和全部依赖文件放在该副机的独立目录。需要已安装 .NET Framework 4.8 与官方 WebView2 Runtime。打开客户端后点齿轮，把默认回环地址改为主机的实际 Funnel HTTPS 根网址，再由本人登录。副机不运行文件服务，也不安装 Tailscale。Mac 和手机继续用浏览器 / 桌面 Web App。

磨砂效果由 Windows 11 系统桌面合成器提供；不支持该效果的 Windows 版本或关闭系统透明效果时使用实色背景，不影响操作。支持高 DPI；本机 175% 缩放单独验收。

## 更新与卸载

更新：退出旧客户端，重新构建后运行 install.ps1；登录资料与热键保留。客户端更新与文件服务更新相互独立。

卸载客户端：

```powershell
./desktop/windows/uninstall-client.ps1 -Root C:\PersonalFileRelay
```

脚本备份客户端程序和热键设置后只移除本客户端及匹配快捷方式。默认保留客户端用户资料、主机所有文件、文件服务和 Funnel。恢复信息在主机根目录 backups/client-uninstall-*；卸载与恢复脚本未对真实环境执行演练。

正式客户端不开放远程调试端口，网页不能调用任意原生命令；原生桥接只接受配置服务器的同源中转站页面。测试模式强制使用 18475 回环测试服务及独立资料目录，不能调试真实资料目录。

构建与系统能力参考：[微软 WebView2 文档](https://learn.microsoft.com/microsoft-edge/webview2/)、[Windows 系统背景类型](https://learn.microsoft.com/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type)。
