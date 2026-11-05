# 仓库 SEO / GEO 内容维护

维护日期：2026-11-05。这里的 GEO 指生成式搜索引擎优化（Generative Engine Optimization），不涉及地理定位。

## 当前范围

本仓库公开提供源码、文档与客户端 Release。README、FAQ、项目事实与导航帮助访问者和工具理解项目；**公开可访问不代表 Google、Bing 或 AI 服务已经收录、引用或给予特定排名**。Topics 只使用通用功能关键词，不放个人主机地址或身份信息，分类方式见 [GitHub 官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)。

## 已落实的内容结构

- 统一名称为 Personal File Relay / 中转站；中文首页和英文简介说明同一实体、相同平台范围。
- 首段直接回答用途、文件保存位置、主机与副机差别；下载和快速开始位于靠前位置。
- 使用准确的功能标题、描述性链接和带替代文本的合成测试截图。
- 将旧上游 README 单独归档，保留出处和许可证，减少上游功能与定制版能力的混淆。
- FAQ 以真实使用问题组织，答案包含依赖、限制和操作入口；验证记录区分本机结果、快照与未验证事项。
- `llms.txt` 只提供阅读导航；项目事实集中记录版本、来源、存储与网络边界。
- 仓库 About 使用中英简述和少量相关 Topics；展示链接指向项目 README，不指向本人文件服务。

Google 的[生成式 AI 搜索指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)继续强调清晰、可信、可访问的内容，没有专用的“AI schema”要求。`llms.txt` 不作为排名信号或收录保证；没有添加关键词堆砌、隐藏文字、虚构评价、虚构下载量或未经验证的性能比较。

## 不在 GitHub 仓库中伪装网站配置

GitHub 托管页面的抓取权限和 HTTP 元数据由平台控制。仓库里的 `robots.txt`、`sitemap.xml` 或 README 中的 meta 标签不会自动配置 github.com 的搜索策略。本轮不为此添加无效配置，也不把登录后的个人云盘当作宣传页面。

本公开发行版本使用独立历史和泛化的主机地址示例。安装者须自行部署并保护主机，源码公开不开放其文件权限。独立展示站点应按实际部署 URL 配置 canonical、元数据、站点地图及与可见内容一致的结构化数据；发布前应核对准备公开的文件和页面范围。

## 后续核验

- 每次功能变化同步更新中英文 README、FAQ、项目事实及版本号；不要改动既有 Release tag 来覆盖历史。
- 检查相对链接、图片、发行附件与哈希，持续区分实际测试与待验收项。
- 检查仓库和 Release 的匿名可访问性；搜索平台的真实索引状态需后续独立核实，不预先承诺排名或 AI 推荐。
