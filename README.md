# DoL 中文网页版

当前版本：**0.5.12.13-chs-1.0.1a**，汉化组正式发布，ModLoader 2.101.1。

- 入口：`index.html`。首次升级前在本机保留 localStorage、sessionStorage、DoL 存档数据库及模组缓存的不可覆盖备份，然后进入新版。
- 备份下载：`backup.html`。JSON 为本机恢复包；标准游戏存档请通过游戏内存档菜单导出。
- 旧版本：`legacy.html`，保留完整 0.5.0.6 中文游戏与原内置模组，可用于读取并导出旧存档。
- 保留相同的故事 IFID、SugarCube 存档 ID 与 DoL 存档数据库名，不清理浏览器存档。新旧模组缓存使用不同键，避免旧模组覆盖新版。
- 保留原有作弊入口、成就限制调整和战斗数值显示；旧版两个自定义模组原始文件保存在 `mods/legacy/`。

官方来源与 SHA-256 校验记录见 `upstream-release.json`。`tools/upgrade_dol.py` 可从固定官方发布重建全部安装文件；`.github/workflows/upgrade.yml` 在独立 Chromium/WebKit 测试档案中验证两种旧存档格式升级、中文显示、模组及自动备份。

不要清理站点数据；手机浏览器的存档仅存在该手机。切换浏览器或设备前请导出标准游戏存档。
