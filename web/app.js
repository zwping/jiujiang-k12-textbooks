(function () {
  "use strict";

  var docs = Array.isArray(window.K12_CATALOG) ? window.K12_CATALOG : [];
  var state = { filtered: [], visible: [], selected: 0, selectedDoc: "", mode: "note", query: "", libraryCollapsed: false, noteTocCollapsed: false, collapsedGrades: Object.create(null), collapsedTerms: Object.create(null) };
  var $ = function (id) { return document.getElementById(id); };
  var searchInput = $("searchInput"), gradeFilter = $("gradeFilter"), termFilter = $("termFilter"), subjectFilter = $("subjectFilter"), kindFilter = $("kindFilter"), categoryFilter = $("categoryFilter"), stageFilter = $("stageFilter"), contentGrid = $("contentGrid"), libraryPanel = $("libraryPanel"), libraryList = $("libraryList"), emptyState = $("emptyState"), libraryToggle = $("libraryToggle"), libraryRestoreButton = $("libraryRestoreButton"), readerEmpty = $("readerEmpty"), reader = $("reader"), noteLayout = $("noteLayout"), noteToc = $("noteToc"), noteView = $("noteView"), pdfView = $("pdfView"), noteTab = $("noteTab"), pdfTab = $("pdfTab"), openFileLink = $("openFileLink"), helpDialog = $("helpDialog"), sidebarToggle = $("sidebarToggle"), topbarToggle = $("topbarToggle");

  function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, function (ch) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]; }); }
  function encodePath(path) { return path.split("/").map(function (part) { return encodeURIComponent(part); }).join("/"); }
  function documentKey(item) { return item ? (item.pdf || item.note || item.path || "") : ""; }
  function markdownToHtml(markdown) {
    var lines = String(markdown || "").replace(/\r/g, "").split("\n"), html = "", index = 0;
    function splitTableRow(line) {
      var value = line.trim();
      if (value.charAt(0) === "|") value = value.slice(1);
      if (value.charAt(value.length - 1) === "|") value = value.slice(0, -1);
      var cells = [], cell = "", codeTicks = 0, mathDelimiter = "";
      function slashCountBefore(source, position) {
        var count = 0;
        for (var slash = position - 1; slash >= 0 && source.charAt(slash) === "\\"; slash -= 1) count += 1;
        return count;
      }
      function hasMathCloser(delimiter, from) {
        for (var closeAt = from; closeAt <= value.length - delimiter.length; closeAt += 1) {
          if (value.slice(closeAt, closeAt + delimiter.length) === delimiter && (delimiter.charAt(0) !== "$" || slashCountBefore(value, closeAt) % 2 === 0)) return true;
        }
        return false;
      }
      for (var index = 0; index < value.length; index += 1) {
        var character = value.charAt(index);
        if (codeTicks > 0) {
          if (character === "`") {
            var codeEnd = index + 1;
            while (value.charAt(codeEnd) === "`") codeEnd += 1;
            var codeCount = codeEnd - index;
            cell += value.slice(index, codeEnd);
            if (codeCount === codeTicks) codeTicks = 0;
            index = codeEnd - 1;
          } else if (character === "\\" && value.charAt(index + 1) === "|") { cell += "\uE000"; index += 1; }
          else cell += character;
          continue;
        }
        if (mathDelimiter) {
          if (value.slice(index, index + mathDelimiter.length) === mathDelimiter) {
            cell += mathDelimiter;
            index += mathDelimiter.length - 1;
            mathDelimiter = "";
          } else cell += character;
          continue;
        }
        if (character === "`") {
          var tickEnd = index + 1;
          while (value.charAt(tickEnd) === "`") tickEnd += 1;
          var tickCount = tickEnd - index;
          cell += value.slice(index, tickEnd);
          codeTicks = tickCount;
          index = tickEnd - 1;
          continue;
        }
        if (character === "\\" && (value.charAt(index + 1) === "(" || value.charAt(index + 1) === "[")) {
          var escapedMathEnd = value.charAt(index + 1) === "(" ? "\\)" : "\\]";
          if (hasMathCloser(escapedMathEnd, index + 2)) {
            mathDelimiter = escapedMathEnd;
            cell += value.slice(index, index + 2);
            index += 1;
            continue;
          }
        }
        if (character === "$" && slashCountBefore(value, index) % 2 === 0) {
          var mathLength = value.charAt(index + 1) === "$" ? 2 : 1;
          var dollarDelimiter = mathLength === 2 ? "$$" : "$";
          if (hasMathCloser(dollarDelimiter, index + mathLength)) {
            mathDelimiter = mathLength === 2 ? "$$" : "$";
            cell += mathDelimiter;
            index += mathLength - 1;
            continue;
          }
        }
        if (character === "|" && !mathDelimiter) {
          var slashCount = 0;
          for (var slashIndex = cell.length - 1; slashIndex >= 0 && cell.charAt(slashIndex) === "\\"; slashIndex -= 1) slashCount += 1;
          if (slashCount % 2 === 1) { cell = cell.slice(0, -1) + "\uE000"; continue; }
          cells.push(cell.trim()); cell = ""; continue;
        }
        cell += character;
      }
      cells.push(cell.trim());
      return cells.map(function (item) { return item.replace(/\uE000/g, "|"); });
    }
    function isTableDelimiter(line) {
      var cells = splitTableRow(line);
      return cells.length > 1 && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")); });
    }
    function tableAlign(cell) {
      var value = cell.replace(/\s/g, "");
      return value.charAt(0) === ":" && value.charAt(value.length - 1) === ":" ? "center" : value.charAt(value.length - 1) === ":" ? "right" : value.charAt(0) === ":" ? "left" : "";
    }
    function inline(text) {
      var tokens = [];
      function token(value) { tokens.push(value); return "\u0000" + (tokens.length - 1) + "\u0000"; }
      function safeUrl(value) { var url = String(value || "").trim().replace(/^<|>$/g, ""); return /^(?:javascript|data):/i.test(url) ? "#" : url; }
      var safe = escapeHtml(text).replace(/\n/g, "\n");
      safe = safe.replace(/!\[([^\]]*)\]\(\s*(?:&lt;)?([^)&]+?)(?:&gt;)?\s*\)/g, function (_, alt) { return token('<span class="md-image">图：' + alt + "</span>"); });
      safe = safe.replace(/\[([^\]]+)\]\(\s*(?:&lt;)?([^)&]+?)(?:&gt;)?\s*\)/g, function (_, label, url) { return token('<a href="' + escapeHtml(safeUrl(url)) + '" target="_blank" rel="noreferrer">' + label + "</a>"); });
      safe = safe.replace(/`([^`\n]+)`/g, function (_, code) { return token("<code>" + code + "</code>"); });
      safe = safe.replace(/\*\*\*([^\n]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
      safe = safe.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>").replace(/__([^\n]+?)__/g, "<strong>$1</strong>");
      safe = safe.replace(/~~([^~\n]+)~~/g, "<del>$1</del>").replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?，。！？]|$)/g, "$1<em>$2</em>");
      safe = safe.replace(/ {2,}\n/g, "<br>").replace(/\n/g, "<br>");
      return safe.replace(/\u0000(\d+)\u0000/g, function (_, tokenIndex) { return tokens[Number(tokenIndex)]; });
    }
    function renderList(start) {
      function parseListItem(line) {
        var match = line.match(/^(\s*)([-*+] |\d+\.\s+)(.*)$/);
        if (!match) return null;
        return { indent: match[1].length, ordered: /^\d+\./.test(match[2]), item: match[3] };
      }
      var first = parseListItem(lines[start]);
      if (!first) return { html: "", next: start };
      var baseIndent = first.indent, ordered = first.ordered, tag = ordered ? "ol" : "ul", output = "<" + tag + ">", cursor = start;
      while (cursor < lines.length) {
        var current = parseListItem(lines[cursor]);
        if (!current && lines[cursor].trim() === "") {
          var siblingIndex = cursor;
          while (siblingIndex < lines.length && lines[siblingIndex].trim() === "") siblingIndex += 1;
          var sibling = siblingIndex < lines.length ? parseListItem(lines[siblingIndex]) : null;
          if (sibling && sibling.indent === baseIndent && sibling.ordered === ordered) { cursor = siblingIndex; current = sibling; }
          else break;
        }
        if (!current || current.indent !== baseIndent || current.ordered !== ordered) break;
        var item = current.item, task = item.match(/^\[([ xX])\]\s+(.+)$/), itemHtml = task ? '<label class="md-task"><input type="checkbox" disabled ' + (task[1].toLowerCase() === "x" ? "checked" : "") + '>' + inline(task[2]) + "</label>" : inline(item);
        cursor += 1;
        var nestedIndex = cursor;
        while (nestedIndex < lines.length && lines[nestedIndex].trim() === "") nestedIndex += 1;
        var nested = nestedIndex < lines.length ? parseListItem(lines[nestedIndex]) : null;
        if (nested && nested.indent > baseIndent) {
          var child = renderList(nestedIndex);
          itemHtml += child.html;
          cursor = child.next;
        }
        output += "<li>" + itemHtml + "</li>";
      }
      return { html: output + "</" + tag + ">", next: cursor };
    }
    while (index < lines.length) {
      var line = lines[index], heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (line.trim() === "") { index += 1; continue; }
      var mathLine = line.trim(), displayMath = null, nextMathLine = index + 1;
      if (mathLine.indexOf("$$") === 0) {
        if (mathLine.length > 4 && mathLine.slice(-2) === "$$") displayMath = mathLine.slice(2, -2);
        else if (mathLine === "$$") {
          var mathLines = [], mathCursor = index + 1;
          while (mathCursor < lines.length && lines[mathCursor].trim() !== "$$") { mathLines.push(lines[mathCursor]); mathCursor += 1; }
          if (mathCursor < lines.length) { displayMath = mathLines.join("\n"); nextMathLine = mathCursor + 1; }
        }
        if (displayMath !== null) { html += '<div class="md-math-block">\\[' + escapeHtml(displayMath) + "\\]</div>"; index = nextMathLine; continue; }
      }
      if (heading) { var level = heading[1].length; html += "<h" + level + ">" + inline(heading[2]) + "</h" + level + ">"; index += 1; continue; }
      if (/^\s{0,3}(```+|~~~+)/.test(line)) {
        var fence = line.match(/^\s{0,3}(```+|~~~+)\s*([^ ]*)/), code = [], marker = fence[1].charAt(0); index += 1;
        while (index < lines.length && !new RegExp("^\\s{0,3}" + marker + "{3,}\\s*$").test(lines[index])) { code.push(lines[index]); index += 1; }
        if (index < lines.length) index += 1;
        html += '<pre class="md-code-block"><code' + (fence[2] ? ' class="language-' + escapeHtml(fence[2]) + '"' : "") + ">" + escapeHtml(code.join("\n")) + "</code></pre>";
        continue;
      }
      if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) { html += "<hr>"; index += 1; continue; }
      if (line.indexOf("|") >= 0 && index + 1 < lines.length && isTableDelimiter(lines[index + 1])) {
        var headers = splitTableRow(line), delimiters = splitTableRow(lines[index + 1]), table = '<div class="md-table-wrap"><table><thead><tr>';
        headers.forEach(function (cell, cellIndex) { var align = tableAlign(delimiters[cellIndex] || ""); table += "<th" + (align ? ' style="text-align:' + align + '"' : "") + ">" + inline(cell) + "</th>"; });
        table += "</tr></thead><tbody>"; index += 2;
        while (index < lines.length && lines[index].indexOf("|") >= 0 && lines[index].trim() !== "") { var cells = splitTableRow(lines[index]); table += "<tr>"; headers.forEach(function (_, cellIndex) { var align = tableAlign(delimiters[cellIndex] || ""); table += "<td" + (align ? ' style="text-align:' + align + '"' : "") + ">" + inline(cells[cellIndex] || "") + "</td>"; }); table += "</tr>"; index += 1; }
        html += table + "</tbody></table></div>"; continue;
      }
      if (/^\s*([-*+] |\d+\.\s+)/.test(line)) { var list = renderList(index); html += list.html; index = list.next; continue; }
      if (/^\s*>/.test(line)) { var quote = []; while (index < lines.length && /^\s*>/.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/, "")); index += 1; } html += "<blockquote>" + markdownToHtml(quote.join("\n")) + "</blockquote>"; continue; }
      var paragraph = [line]; index += 1;
      while (index < lines.length && lines[index].trim() !== "" && !/^\s{0,3}(#{1,6})\s+/.test(lines[index]) && !/^\s{0,3}(```+|~~~+)/.test(lines[index]) && !/^\s*([-*+] |\d+\.\s+|>)/.test(lines[index]) && !(lines[index].indexOf("|") >= 0 && index + 1 < lines.length && isTableDelimiter(lines[index + 1]))) { paragraph.push(lines[index]); index += 1; }
      html += "<p>" + inline(paragraph.join("\n")) + "</p>";
    }
    return html;
  }
  var mathTypesetQueue = Promise.resolve();
  function typesetMath() {
    var math = window.MathJax;
    if (!math || typeof math.typesetPromise !== "function") return;
    var ready = math.startup && math.startup.promise ? math.startup.promise : Promise.resolve();
    mathTypesetQueue = mathTypesetQueue.catch(function () {}).then(function () { return ready; }).then(function () { if (math.typesetClear) math.typesetClear([noteView]); return math.typesetPromise([noteView]); }).catch(function (error) { console.error("LaTeX 公式渲染失败", error); });
  }
  if (window.MutationObserver) {
    var noteMathObserver = new MutationObserver(function (records) {
      if (records.some(function (record) { return record.target === noteView; })) typesetMath();
    });
    noteMathObserver.observe(noteView, { childList: true });
  }
  window.addEventListener("load", typesetMath);
  function buildNoteToc() {
    var headings = Array.prototype.slice.call(noteView.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    if (!headings.length) { noteToc.hidden = true; noteToc.innerHTML = ""; return; }
    noteToc.hidden = false;
    var html = '<div class="note-toc-heading"><div class="note-toc-title">本文目录</div><button class="note-toc-toggle" type="button" aria-controls="noteTocList" aria-expanded="' + String(!state.noteTocCollapsed) + '" aria-label="' + (state.noteTocCollapsed ? '展开笔记目录' : '收起笔记目录') + '" title="' + (state.noteTocCollapsed ? '展开笔记目录' : '收起笔记目录') + '">' + (state.noteTocCollapsed ? '›' : '‹') + '</button></div><div id="noteTocList" class="note-toc-list"' + (state.noteTocCollapsed ? ' hidden' : '') + '>';
    headings.forEach(function (heading, index) {
      var id = "md-heading-" + (index + 1);
      heading.id = id;
      var level = Number(heading.tagName.slice(1));
      html += '<button class="note-toc-item level-' + level + '" type="button" data-target="' + id + '">' + escapeHtml(heading.textContent) + "</button>";
    });
    noteToc.innerHTML = html + "</div>";
    noteLayout.classList.toggle("toc-collapsed", state.noteTocCollapsed);
    var tocToggle = noteToc.querySelector(".note-toc-toggle");
    tocToggle.addEventListener("click", function () {
      state.noteTocCollapsed = !state.noteTocCollapsed;
      noteLayout.classList.toggle("toc-collapsed", state.noteTocCollapsed);
      var collapsed = state.noteTocCollapsed;
      tocToggle.setAttribute("aria-expanded", String(!collapsed));
      tocToggle.setAttribute("aria-label", collapsed ? "展开笔记目录" : "收起笔记目录");
      tocToggle.title = collapsed ? "展开笔记目录" : "收起笔记目录";
      tocToggle.textContent = collapsed ? "›" : "‹";
      noteToc.querySelector(".note-toc-list").hidden = collapsed;
    });
    Array.prototype.forEach.call(noteToc.querySelectorAll(".note-toc-item"), function (button) {
      button.addEventListener("click", function () {
        var target = document.getElementById(button.dataset.target);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    });
  }
  function unique(values) { return values.filter(function (value, index, array) { return array.indexOf(value) === index; }); }
  function renderOptions(control, label, values, selected) { control.innerHTML = '<option value="all">' + label + '</option>' + values.map(function (value) { return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>"; }).join(""); control.value = values.indexOf(selected) >= 0 ? selected : "all"; }
  function readUrlFilters() {
    var params = new URLSearchParams(window.location.search);
    return { query: params.get("q") || "", grade: params.get("grade") || "all", term: params.get("term") || "all", subject: params.get("subject") || "all", kind: params.get("kind") || "all", category: params.get("category") || "all", stage: params.get("stage") || "all", mode: params.get("mode") || "note", doc: params.get("doc") || "" };
  }
  function writeUrlFilters() {
    var params = new URLSearchParams();
    var selectedItem = state.visible[state.selected];
    var values = { q: searchInput.value.trim(), grade: gradeFilter.value, term: termFilter.value, subject: subjectFilter.value, kind: kindFilter.value, category: categoryFilter.value, stage: stageFilter.value, mode: state.mode, doc: documentKey(selectedItem) };
    Object.keys(values).forEach(function (key) { if (values[key] && values[key] !== "all") params.set(key, values[key]); });
    var query = params.toString(), url = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
    window.history.replaceState(null, "", url);
  }
  function setupFilters(initial) {
    renderOptions(gradeFilter, "全部年级", unique(docs.map(function (item) { return item.grade; })), initial.grade);
    renderOptions(subjectFilter, "全部科目", unique(docs.map(function (item) { return item.subject; }).filter(Boolean)), initial.subject);
    renderOptions(categoryFilter, "全部类别", unique(docs.map(function (item) { return item.courseCategory; }).filter(Boolean)), initial.category);
    renderOptions(stageFilter, "全部阶段", unique(docs.map(function (item) { return item.learningStage; }).filter(Boolean)), initial.stage);
    searchInput.value = initial.query;
    termFilter.value = ["all", "上学期", "下学期", "全年"].indexOf(initial.term) >= 0 ? initial.term : "all";
    kindFilter.value = ["all", "textbook", "summary"].indexOf(initial.kind) >= 0 ? initial.kind : "all";
    state.mode = initial.mode === "pdf" ? "pdf" : "note";
    state.selectedDoc = initial.doc;
  }
  function refreshLinkedFilters() {
    var selected = { grade: gradeFilter.value, term: termFilter.value, subject: subjectFilter.value, kind: kindFilter.value, category: categoryFilter.value, stage: stageFilter.value };
    var definitions = [{ key: "grade", field: "grade", control: gradeFilter, label: "全部年级" }, { key: "subject", field: "subject", control: subjectFilter, label: "全部科目" }, { key: "category", field: "courseCategory", control: categoryFilter, label: "全部类别" }, { key: "stage", field: "learningStage", control: stageFilter, label: "全部阶段" }];
    var fields = { grade: "grade", term: "term", subject: "subject", kind: "kind", category: "courseCategory", stage: "learningStage" };
    definitions.forEach(function (definition) {
      var available = unique(docs.filter(function (item) { return Object.keys(selected).every(function (key) { return key === definition.key || selected[key] === "all" || item[fields[key]] === selected[key]; }); }).map(function (item) { return item[definition.field]; }).filter(Boolean));
      if (selected[definition.key] !== "all" && available.indexOf(selected[definition.key]) < 0) selected[definition.key] = "all";
      renderOptions(definition.control, definition.label, available, selected[definition.key]);
    });
  }
  function treeGroup(item) { if (item.grade === "K10-高中") return ({ "基础阶段": "基础阶段-必修", "方向阶段": "方向阶段-选择性必修", "综合复习阶段": "综合复习" })[item.learningStage] || item.learningStage || "综合复习"; return item.term; }
  function groupKey(grade, group) { return grade + "::" + group; }
  function rebuildVisible() { state.visible = state.filtered.filter(function (item) { return !state.collapsedGrades[item.grade] && !state.collapsedTerms[groupKey(item.grade, treeGroup(item))]; }); state.selected = Math.min(state.selected, Math.max(0, state.visible.length - 1)); }
  function updateLibraryVisibility() { libraryPanel.classList.toggle("library-collapsed", state.libraryCollapsed); contentGrid.classList.toggle("library-hidden", state.libraryCollapsed); libraryList.hidden = state.libraryCollapsed; emptyState.hidden = state.libraryCollapsed || state.filtered.length !== 0; libraryRestoreButton.hidden = !state.libraryCollapsed; libraryRestoreButton.setAttribute("aria-expanded", String(!state.libraryCollapsed)); }
  function setLibraryState(collapsed, persist) { state.libraryCollapsed = collapsed; libraryToggle.setAttribute("aria-expanded", String(!collapsed)); libraryToggle.setAttribute("aria-label", collapsed ? "关闭教材目录" : "收起教材目录"); libraryToggle.title = collapsed ? "关闭教材目录" : "收起教材目录"; libraryToggle.querySelector(".toggle-icon").textContent = collapsed ? "⌄" : "⌃"; updateLibraryVisibility(); if (persist) writePanelState("k12-library-collapsed", collapsed); }
  function renderList() {
    $("countBadge").textContent = state.filtered.length + " 项"; $("listTitle").textContent = state.query ? "搜索结果" : (gradeFilter.value === "all" ? "全部内容" : gradeFilter.value); emptyState.hidden = state.filtered.length !== 0;
    var groups = [], grades = Object.create(null);
    state.filtered.forEach(function (item) { var group = grades[item.grade], groupName = treeGroup(item); if (!group) { group = { grade: item.grade, terms: [], termMap: Object.create(null) }; grades[item.grade] = group; groups.push(group); } var term = group.termMap[groupName]; if (!term) { term = { term: groupName, items: [] }; group.termMap[groupName] = term; group.terms.push(term); } term.items.push(item); });
    var html = "", visibleIndex = 0;
    groups.forEach(function (group) {
      var gradeCollapsed = !!state.collapsedGrades[group.grade], gradeCount = group.terms.reduce(function (sum, term) { return sum + term.items.length; }, 0);
      html += '<section class="tree-grade"><button class="tree-toggle grade-toggle" type="button" data-action="grade" data-grade="' + escapeHtml(group.grade) + '" aria-expanded="' + (!gradeCollapsed) + '"><span class="tree-chevron">' + (gradeCollapsed ? "▸" : "▾") + '</span><span class="tree-name">' + escapeHtml(group.grade) + '</span><span class="tree-count">' + gradeCount + ' 项</span></button>';
      if (!gradeCollapsed) { html += '<div class="tree-children">'; group.terms.forEach(function (term) { var key = groupKey(group.grade, term.term), termCollapsed = !!state.collapsedTerms[key]; html += '<section class="tree-term"><button class="tree-toggle term-toggle" type="button" data-action="term" data-grade="' + escapeHtml(group.grade) + '" data-term="' + escapeHtml(term.term) + '" aria-expanded="' + (!termCollapsed) + '"><span class="tree-chevron">' + (termCollapsed ? "▸" : "▾") + '</span><span class="tree-name">' + escapeHtml(term.term) + '</span><span class="tree-count">' + term.items.length + ' 项</span></button>'; if (!termCollapsed) { html += '<div class="term-children">'; term.items.forEach(function (item) { var index = visibleIndex++, selected = index === state.selected ? " selected" : "", subtitle = item.grade + " · " + item.term + " · " + (item.subject || "学期汇总"); if (item.courseCategory && item.courseCategory !== "义务教育") subtitle += " · " + item.courseCategory + " · " + item.learningStage; html += '<button class="library-item' + selected + '" data-index="' + index + '" role="option" aria-selected="' + (index === state.selected) + '"><span class="item-index">' + String(item.order).padStart(2, "0") + '</span><span><span class="item-title">' + escapeHtml(item.title) + '</span><span class="item-subtitle">' + escapeHtml(subtitle) + '</span></span><span class="item-kind">' + (item.kind === "summary" ? "汇总" : "PDF") + '</span></button>'; }); html += '</div>'; } html += '</section>'; }); html += '</div>'; }
      html += '</section>';
    });
    libraryList.innerHTML = html;
    Array.prototype.forEach.call(libraryList.querySelectorAll(".library-item"), function (button) { button.addEventListener("click", function () { state.selected = Number(button.dataset.index); renderList(); openDocument(state.visible[state.selected], true); }); });
    Array.prototype.forEach.call(libraryList.querySelectorAll("[data-action=grade]"), function (button) { button.addEventListener("click", function () { state.collapsedGrades[button.dataset.grade] = !state.collapsedGrades[button.dataset.grade]; rebuildVisible(); renderList(); if (state.visible.length) openDocument(state.visible[state.selected], false); }); });
    Array.prototype.forEach.call(libraryList.querySelectorAll("[data-action=term]"), function (button) { button.addEventListener("click", function () { var key = groupKey(button.dataset.grade, button.dataset.term); state.collapsedTerms[key] = !state.collapsedTerms[key]; rebuildVisible(); renderList(); if (state.visible.length) openDocument(state.visible[state.selected], false); }); });
    updateLibraryVisibility();
  }
  function applyFilters() { var currentItem = state.visible[state.selected]; if (currentItem) state.selectedDoc = documentKey(currentItem); refreshLinkedFilters(); var grade = gradeFilter.value, term = termFilter.value, subject = subjectFilter.value, kind = kindFilter.value, category = categoryFilter.value, stage = stageFilter.value; state.query = searchInput.value.trim().toLowerCase(); state.filtered = docs.filter(function (item) { var text = (item.title + " " + item.subject + " " + item.grade + " " + item.term + " " + item.courseCategory + " " + item.learningStage).toLowerCase(); return (grade === "all" || item.grade === grade) && (term === "all" || item.term === term) && (subject === "all" || item.subject === subject) && (kind === "all" || item.kind === kind) && (category === "all" || item.courseCategory === category) && (stage === "all" || item.learningStage === stage) && (!state.query || text.indexOf(state.query) >= 0); }); rebuildVisible(); var requestedIndex = state.visible.findIndex(function (item) { return documentKey(item) === state.selectedDoc; }); state.selected = requestedIndex >= 0 ? requestedIndex : Math.min(state.selected, Math.max(0, state.visible.length - 1)); if (state.visible.length) { state.selectedDoc = documentKey(state.visible[state.selected]); openDocument(state.visible[state.selected], false); } else { state.selectedDoc = ""; writeUrlFilters(); closeReader(); } renderList(); }
  function closeReader() { reader.hidden = true; readerEmpty.hidden = false; }
  function openDocument(item, scroll) { if (!item) return; if (!item.pdf) state.mode = "note"; writeUrlFilters(); reader.hidden = false; readerEmpty.hidden = true; $("readerMeta").textContent = item.grade + "  /  " + item.term + "  /  " + (item.subject || "学期汇总"); $("readerTitle").textContent = item.title; var notePath = item.note || item.path, pdfPath = item.pdf, activePath = state.mode === "pdf" && pdfPath ? pdfPath : notePath; openFileLink.href = "../" + encodePath(activePath); pdfTab.disabled = !pdfPath; pdfTab.title = pdfPath ? "查看原版 PDF" : "学期汇总没有对应 PDF"; if (state.mode === "pdf" && pdfPath) { noteLayout.hidden = true; pdfView.hidden = false; pdfView.src = "../" + encodePath(pdfPath); } else { noteLayout.hidden = false; pdfView.hidden = true; noteView.innerHTML = typeof item.noteContent === "string" ? markdownToHtml(item.noteContent) : "<p>该笔记未嵌入目录数据，请使用“新窗口打开”查看文件。</p>"; buildNoteToc(); } noteTab.classList.toggle("active", state.mode !== "pdf"); pdfTab.classList.toggle("active", state.mode === "pdf"); if (scroll) reader.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function toggleMode() { var item = state.visible[state.selected]; if (!item) return; state.mode = !item.pdf ? "note" : (state.mode === "note" ? "pdf" : "note"); openDocument(item, false); }
  function move(delta) { if (!state.visible.length) return; state.selected = (state.selected + delta + state.visible.length) % state.visible.length; renderList(); openDocument(state.visible[state.selected], true); }
  function readPanelState(key) { try { return window.localStorage.getItem(key) === "1"; } catch (error) { return false; } }
  function writePanelState(key, collapsed) { try { window.localStorage.setItem(key, collapsed ? "1" : "0"); } catch (error) {} }
  function setPanelState(panel, collapsed, persist) {
    var bodyClass = panel + "-collapsed";
    var toggle = panel === "sidebar" ? sidebarToggle : topbarToggle;
    document.body.classList.toggle(bodyClass, collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? (panel === "sidebar" ? "展开侧栏" : "展开顶部栏") : (panel === "sidebar" ? "收起侧栏" : "收起顶部栏");
    toggle.querySelector(".toggle-label").textContent = collapsed ? (panel === "sidebar" ? "展开侧栏" : "展开顶部栏") : (panel === "sidebar" ? "收起侧栏" : "收起顶部栏");
    toggle.querySelector(".toggle-icon").textContent = collapsed ? (panel === "sidebar" ? "›" : "⌄") : (panel === "sidebar" ? "‹" : "⌃");
    if (persist) writePanelState("k12-" + panel + "-collapsed", collapsed);
  }
  function togglePanel(panel) { var collapsed = document.body.classList.contains(panel + "-collapsed"); setPanelState(panel, !collapsed, true); }
  function showHelp() { if (!helpDialog.open) helpDialog.showModal(); }
  function clearFilters() { searchInput.value = ""; gradeFilter.value = "all"; termFilter.value = "all"; subjectFilter.value = "all"; kindFilter.value = "all"; categoryFilter.value = "all"; stageFilter.value = "all"; state.selected = 0; state.selectedDoc = ""; state.visible = []; applyFilters(); }
  [searchInput, gradeFilter, termFilter, subjectFilter, kindFilter, categoryFilter, stageFilter].forEach(function (control) { control.addEventListener(control === searchInput ? "input" : "change", applyFilters); });
  $("clearButton").addEventListener("click", clearFilters); $("helpButton").addEventListener("click", showHelp); $("readerHelpButton").addEventListener("click", showHelp); $("closeHelpButton").addEventListener("click", function () { helpDialog.close(); }); noteTab.addEventListener("click", function () { state.mode = "note"; openDocument(state.visible[state.selected], false); }); pdfTab.addEventListener("click", function () { state.mode = "pdf"; openDocument(state.visible[state.selected], false); }); sidebarToggle.addEventListener("click", function () { togglePanel("sidebar"); }); topbarToggle.addEventListener("click", function () { togglePanel("topbar"); }); libraryToggle.addEventListener("click", function () { setLibraryState(!state.libraryCollapsed, true); }); libraryRestoreButton.addEventListener("click", function () { setLibraryState(false, true); });
  document.addEventListener("keydown", function (event) { var tag = document.activeElement && document.activeElement.tagName, typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA"; if (event.key === "[" && !typing) { event.preventDefault(); togglePanel("sidebar"); return; } if (event.key === "]" && !typing) { event.preventDefault(); togglePanel("topbar"); return; } if (event.key === "/" && !typing) { event.preventDefault(); searchInput.focus(); return; } if (event.key === "Escape" && typing) { document.activeElement.blur(); return; } if (typing) return; if (event.key.toLowerCase() === "l") { event.preventDefault(); setLibraryState(!state.libraryCollapsed, true); return; } if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); move(1); } else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); move(-1); } else if (event.key === "Enter") { if (document.activeElement && (document.activeElement.dataset.action || document.activeElement === sidebarToggle || document.activeElement === topbarToggle)) return; event.preventDefault(); openDocument(state.visible[state.selected], true); } else if (event.key.toLowerCase() === "n") { event.preventDefault(); toggleMode(); } else if (event.key === "?") { event.preventDefault(); showHelp(); } });
  setupFilters(readUrlFilters()); applyFilters(); setPanelState("sidebar", readPanelState("k12-sidebar-collapsed"), false); setPanelState("topbar", readPanelState("k12-topbar-collapsed"), false); setLibraryState(readPanelState("k12-library-collapsed"), false);
}());
