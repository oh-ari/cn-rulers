// ==UserScript==
// @name         CN Rulers [Alliance Display]
// @namespace    https://github.com/austin/cn-rulers
// @version      1.0
// @author       Ari / Mochi
// @description  Adds a "Ruler Name" column to the alliance members table by matching nation names to the daily CSV dataset.
// @match        https://www.cybernations.net/alliance_display.asp*
// @match        http://www.cybernations.net/alliance_display.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const CSV_URL = 'https://raw.githubusercontent.com/oh-ari/oh-ari.github.io/refs/heads/main/daily/CN_Nation_Stats.csv';
  const gmRequest = (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) ? GM.xmlHttpRequest : (typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null);

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function fetchCsv(url) {
    return new Promise((resolve, reject) => {
      if (gmRequest) {
        try {
          gmRequest({ method: 'GET', url, headers: { Accept: 'text/plain' }, onload: (res) => resolve(res.responseText), onerror: reject, ontimeout: () => reject(new Error('CSV fetch timed out')) });
        } catch (e) {
          reject(e);
        }
      } else {
        fetch(url, { credentials: 'omit' })
          .then((r) => { if (!r.ok) throw new Error(`Failed to fetch CSV: ${r.status}`); return r.text(); })
          .then(resolve, reject);
      }
    });
  }

  function parseRulerMap(csvText) {
    const map = new Map();
    if (!csvText) return map;
    const lines = csvText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('Nation ID|')) continue;
      const parts = line.split('|');
      if (parts.length < 3) continue;
      const rulerName = normalize(parts[1]);
      const nationName = normalize(parts[2]);
      if (!nationName) continue;
      map.set(nationName, rulerName);
    }
    return map;
  }

  function getMembersTable() {
    const tables = Array.from(document.querySelectorAll("table[bgcolor='#F7F7F7']"));
    for (const t of tables) {
      const header = t.querySelector('tr');
      if (!header) continue;
      const hasNation = Array.from(header.cells).some((td) => /Nation\s*Name/i.test(td.textContent || ''));
      const hasStatus = Array.from(header.cells).some((td) => /Status/i.test(td.textContent || ''));
      if (hasNation && hasStatus) return t;
    }
    return null;
  }

  function shiftLeaderInfo(gapPx = 12, leaderGapPx = Math.max(0, Math.floor(gapPx / 2))) {
    try {
      let infoTable = null;
      const leaderBold = Array.from(document.querySelectorAll('b')).find((b) => /\bLeader:\b/i.test((b.textContent || '').trim()));
      if (leaderBold) infoTable = leaderBold.closest('table');
      if (!infoTable) infoTable = document.querySelector('table#table17[bgcolor="#FFFFFF"][bordercolor="#000080"][width="100%"], table#table17[bgcolor="#FFFFFF"][bordercolor="#000080"][width="900"]');
      if (!infoTable) infoTable = document.querySelector('table#table17[bgcolor="#FFFFFF"][bordercolor="#000080"]');
      if (!infoTable) return;
      infoTable.style.marginLeft = `${leaderGapPx}px`;
      infoTable.style.paddingLeft = `${leaderGapPx}px`;
      let parent = infoTable.parentElement;
      let depth = 0;
      while (parent && parent !== document.body && depth < 5) {
        if (parent.tagName === 'TD' || parent.tagName === 'DIV') {
          parent.style.marginLeft = `${gapPx}px`;
          parent.style.paddingLeft = `${gapPx}px`;
        }
        parent = parent.parentElement;
        depth++;
      }
      
    } catch (_) {}
  }

  function insertRulerHeader(tableElement) {
    const headerRow = tableElement.querySelector('tr');
    if (!headerRow) return { headerInserted: false, insertedIndex: -1 };
    if (Array.from(headerRow.cells).some((td) => /Ruler\s*Name/i.test(td.textContent || ''))) return { headerInserted: false, insertedIndex: -1 };
    const statusIdx = Array.from(headerRow.cells).findIndex((td) => /Status/i.test(td.textContent || ''));
    if (statusIdx !== -1) headerRow.deleteCell(statusIdx);
    const cellsNow = Array.from(headerRow.cells);
    const nationIdx = cellsNow.findIndex((td) => /Nation\s*Name/i.test(td.textContent || ''));
    if (nationIdx === -1) return { headerInserted: false, insertedIndex: -1 };
    const rulerHeader = document.createElement('td');
    rulerHeader.setAttribute('width', '20%');
    rulerHeader.setAttribute('height', '14');
    rulerHeader.setAttribute('bgcolor', '#000080');
    rulerHeader.setAttribute('align', 'center');
    rulerHeader.setAttribute('valign', 'top');
    rulerHeader.innerHTML = '<p><font color="#FFFFFF">Ruler Name</font><br></p>';
    const nationHeaderCell = cellsNow[nationIdx];
    const refNode = nationHeaderCell.nextElementSibling;
    if (refNode) headerRow.insertBefore(rulerHeader, refNode); else headerRow.appendChild(rulerHeader);
    return { headerInserted: true, insertedIndex: nationIdx + 1 };
  }

  function getRulerFromRow(rowElement) {
    const img = rowElement.querySelector("td img[title^='Ruler:']");
    if (!img || !img.title) return '';
    const m = img.title.match(/^Ruler:\s*(.*)$/i);
    return m ? normalize(m[1]) : '';
  }

  function getStatusCell(rowElement, nationCell) {
    let td = rowElement.querySelector("td a[href*='send_message.asp']");
    if (td) return td.closest('td');
    td = rowElement.querySelector("td img[title*='Member'], td img[title*='Heir'], td img[title*='Owner'], td img[title*='Pending']");
    if (td) return td.closest('td');
    if (nationCell) {
      const next = nationCell.nextElementSibling;
      if (next && next.tagName === 'TD') return next;
      const next2 = next && next.nextElementSibling;
      if (next2 && next2.tagName === 'TD') return next2;
    }
    return null;
  }

  function addRulerCells(tableElement, nationToRulerMap) {
    const rows = Array.from(tableElement.querySelectorAll('tr'));
    if (rows.length === 0) return;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nationLink = row.querySelector("a[href*='nation_drill_display.asp']");
      if (!nationLink) continue;
      const nationName = normalize(nationLink.textContent);
      const nationCell = nationLink.closest('td');
      if (!nationCell) continue;
      const rulerFromCsv = nationToRulerMap.get(nationName) || '';
      const rulerFallback = rulerFromCsv || getRulerFromRow(row);
      const rulerCell = document.createElement('td');
      const container = document.createElement('div');
      container.style.width = '150px';
      container.style.overflowX = 'hidden';
      const rulerAnchor = document.createElement('a');
      rulerAnchor.href = nationLink.href;
      rulerAnchor.textContent = rulerFallback || '';
      if (rulerFallback) rulerAnchor.title = `Ruler: ${rulerFallback}`;
      container.appendChild(rulerAnchor);
      const statusCell = getStatusCell(row, nationCell);
      if (statusCell) {
        const iconsWrapper = document.createElement('span');
        iconsWrapper.style.marginLeft = '6px';
        iconsWrapper.style.whiteSpace = 'nowrap';
        while (statusCell.firstChild) iconsWrapper.appendChild(statusCell.firstChild);
        container.appendChild(iconsWrapper);
        statusCell.remove();
      }
      rulerCell.appendChild(container);
      nationCell.insertAdjacentElement('afterend', rulerCell);
    }
  }

  async function applyRulerColumn() {
    const table = getMembersTable();
    if (!table) return;
    shiftLeaderInfo(12);
    insertRulerHeader(table);
    try {
      const csvText = await fetchCsv(CSV_URL);
      const nationToRuler = parseRulerMap(csvText);
      addRulerCells(table, nationToRuler);
    } catch (_) {
      addRulerCells(table, new Map());
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyRulerColumn); else applyRulerColumn();
})();
