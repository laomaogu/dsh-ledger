# 发布指南（GitHub）

面向仓库维护者。仓库结构已经是「可直接 `git init` 并推送」的状态。

## 1. 发布前检查

```sh
cd dsh-ledger
npm run check                 # node --check index.js && node --check client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('locale/zh.json','utf8'))"
```

确认 `package.json` 里：

- `name` 为 `dsh-ledger`，`dsh.bundle.patch` 指向 `./cordis.patch.yml`；
- `dsh.client.platform` 为 `web`；
- `exports` 含 `./client`、`./locale/*.json`、`./icon`；
- `files` 覆盖全部运行时文件。

如果要改包名：同时修改 `package.json.name`、`cordis.patch.yml` 里的 `name`（行 id `personal-ledger` 可保留），
以及 `client.js` 顶部的 `window.__ModuleLoader__.load({ id: ... })`。

## 2. 建仓库并推送

```sh
cd dsh-ledger
git init -b main
git add .
git -c user.name="Your Name" -c user.email="you@example.com" commit -m "feat: dsh-ledger 1.0.0"
git remote add origin git@github.com:<owner>/dsh-ledger.git
git push -u origin main
```

> 本目录没有初始化 git，也没有预置作者身份，避免把占位作者写进提交历史。
> 记得配置一次全局身份：`git config --global user.name "..."`、`git config --global user.email "..."`。

建仓后建议填写：

- **Description**：`Personal bookkeeping plugin for DeepSeek Harness: expenses, insights and charts, locally stored.`
- **Topics**：`dsh-plugin`、`deepseek-harness`、`bookkeeping`、`ledger`、`expense-tracker`、`personal-finance`
- **License**：MIT（已含 LICENSE 文件）

## 3. 打标签与 Release

```sh
git tag -a v1.0.0 -m "dsh-ledger 1.0.0"
git push origin v1.0.0
```

在 GitHub Release 中：

- 选择 tag `v1.0.0`，标题 `dsh-ledger 1.0.0`；
- 正文可以复用 `CHANGELOG.md` 的 1.0.0 段；
- 附件上传源码包（与 `dsh-ledger/` 同级生成的 `dsh-ledger-1.0.0.tar.gz` 与其 `.sha256`），
  或直接用 GitHub 自动生成的 `Source code (tar.gz)`。

## 4. 安装验证

在干净环境或新 profile 中：

```sh
dsh plugin --profile test add github:<owner>/dsh-ledger
```

然后在「插件」页启用 `dsh-ledger` bundle，确认：

1. 左栏出现钱包图标，面板可打开；
2. 「记一笔」能保存，概览出现数据；
3. 对话里「记一笔：测试 1 元」能被 `ledger_add` 写入同一份数据。

## 5. 可选：发布到 npm

当前 `package.json` 带 `"private": true`（只走 GitHub / 本地目录安装）。若要发 npm：

1. 删除 `"private": true`；
2. 补 `repository` / `homepage` / `bugs`；
3. 确认包名可用（`dsh-ledger` 可能已被占用，必要时改成 `@<scope>/dsh-ledger`，
   并同步修改 `cordis.patch.yml` 与 `client.js` 的模块 id）；
4. `npm publish --access public`。

## 6. 版本约定

- `1.0.x`：修复；
- `1.1.0`：向后兼容的新功能（例如新增图表或提示）；
- `2.0.0`：破坏性变更（数据文件结构、工具参数、行 id）。

数据文件带 `version: 1` 字段；若改变结构，请提升该字段并在 `sanitizeState()` 里做迁移。
