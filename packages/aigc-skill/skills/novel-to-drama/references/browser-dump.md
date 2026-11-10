# 浏览器导出正文（破解截断试读的关键步骤）

## 为什么必须走浏览器

番茄对非浏览器客户端（curl/urllib/requests）做了**指纹降级**：即使带上完整 Cookie，锁定章也只返回 200 字试读（`isChapterLock: true`）。真实浏览器页上下文（sec-sdk 签名过的 fetch）才返回全量正文（`isChapterLock: false`）。**不要**试图解字体映射或对抗反爬——用浏览器页内 fetch 导出即可。

## 步骤

1. 用 chrome-devtools/playwright MCP 打开任意一个该书的 `/reader/<id>` 页
2. 分批执行下面的页内脚本（每批 20–25 章，批间自然间隔），用 evaluate_script 的 `filePath` 参数直接把结果存到 `<项目>/raw/batch-NN.json`
3. 全部批跑完后：`python3 -I tools/fanqie_ocr.py --from-raw --out <项目>`（仓根执行） 重建 OCR 文本

## 页内导出脚本模板（evaluate_script，function 格式）

```js
async () => {
  const IDS = ["<itemId1>", "<itemId2>"];  // 从 catalog.json 取，20~25 个一批
  const out = {};
  for (const id of IDS) {
    try {
      const html = await (await fetch('/reader/' + id, {credentials: 'include'})).text();
      const marker = 'window.__INITIAL_STATE__=';
      const i = html.indexOf(marker);
      const seg = html.slice(i + marker.length);
      let depth = 0, end = 0;
      for (let j = 0; j < seg.length; j++) {
        const c = seg[j];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
      }
      const raw = seg.slice(0, end).replace(/\bundefined\b/g, 'null').replace(/,\s*([}\]])/g, '$1');
      const st = JSON.parse(raw).reader.chapterData;
      out[id] = {content: st.content || '', title: st.title, words: st.chapterWordNumber, lock: !!st.isChapterLock};
    } catch (e) { out[id] = {error: String(e)}; }
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
}
```

## 校验（每次导出后必做）

- 条目数 == 批次 ID 数；`error` 为 0；`lock` 为 0
- `content` 长度 ≥ 1500 字符（正常 2700–3200）；与 `words`（chapterWordNumber）对比偏差 <10%
- 重建后 `novel/chNNN.txt` 正文长度同样按上式抽检

## 已知坑

- 批次多时容易漏发/错存文件名：导出完成后用 catalog.json 对 `raw/batch-*.json` 的 keys 做差集校验（全书逐章一个不能少）
- subset 字体（PUA→字形）从页面 CSS 动态取；同一本书通常整本同一个字体，但换书/换天要重新校验 PUA 覆盖率
