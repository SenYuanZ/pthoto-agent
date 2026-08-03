// Photography Knowledge Q&A Chat - Frontend Logic

(function () {
  'use strict';

  // --- State ---
  let sessionId = generateSessionId();
  let isStreaming = false;

  // --- DOM Elements ---
  const chatContainer = document.getElementById('chatContainer');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const welcomeMessage = document.getElementById('welcomeMessage');

  // --- Session ID ---
  function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // --- Auto-resize textarea ---
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    sendBtn.disabled = messageInput.value.trim() === '' || isStreaming;
  });

  // --- Keyboard shortcuts ---
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        chatForm.dispatchEvent(new Event('submit'));
      }
    }
  });

  // --- New Chat ---
  newChatBtn.addEventListener('click', () => {
    if (isStreaming) return;
    sessionId = generateSessionId();
    const messages = chatContainer.querySelectorAll('.message');
    messages.forEach((m) => m.remove());
    welcomeMessage.style.display = 'block';
  });

  // --- Submit handler ---
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isStreaming) return;

    const question = messageInput.value.trim();
    if (!question) return;

    welcomeMessage.style.display = 'none';

    addMessage('user', question);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    isStreaming = true;

    const assistantEl = addMessage('assistant', '');
    const bubbleEl = assistantEl.querySelector('.bubble');
    const typingIndicator = assistantEl.querySelector('.typing-indicator');

    try {
      const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, question }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let sources = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));

              if (json.type === 'token') {
                if (typingIndicator) typingIndicator.remove();
                fullText += json.token;
                bubbleEl.innerHTML = renderMarkdown(fullText);
                scrollToBottom();
              } else if (json.type === 'done') {
                fullText = json.fullResponse || fullText;
                sources = json.sources || [];
                if (typingIndicator) typingIndicator.remove();
                bubbleEl.innerHTML = renderMarkdown(fullText);
                if (sources.length > 0) {
                  const sourcesEl = buildSources(sources);
                  assistantEl.querySelector('.content').appendChild(sourcesEl);
                }
                scrollToBottom();
              } else if (json.type === 'error') {
                if (typingIndicator) typingIndicator.remove();
                bubbleEl.innerHTML =
                  `<p style="color: var(--error)">❌ ${escapeHtml(json.error || '发生错误')}</p>`;
              }
            } catch (parseErr) {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      if (typingIndicator) typingIndicator.remove();
      bubbleEl.innerHTML =
        `<p style="color: var(--error)">❌ 连接错误：${escapeHtml(error.message)}</p>`;
    } finally {
      isStreaming = false;
      sendBtn.disabled = messageInput.value.trim() === '';
      messageInput.focus();
    }
  });

  // --- Message Rendering ---
  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message message-${role}`;

    if (role === 'user') {
      div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    } else {
      div.innerHTML = `
        <div class="avatar">📷</div>
        <div class="content">
          <div class="bubble">
            <div class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>`;
    }

    chatContainer.appendChild(div);
    scrollToBottom();
    return div;
  }

  // --- Sources with click-to-expand jump-back (citation) ---
  function buildSources(sources) {
    const wrap = document.createElement('div');
    wrap.className = 'sources';

    const label = document.createElement('span');
    label.className = 'sources-label';
    label.textContent = '📚 参考来源：';
    wrap.appendChild(label);

    sources.forEach((s) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'source-tag';
      tag.textContent = s.source || '未分类';
      tag.title = '点击查看引用的原文片段';

      const preview = document.createElement('pre');
      preview.className = 'source-preview';
      preview.hidden = true;
      preview.textContent = s.text || '(无内容)';

      tag.addEventListener('click', () => {
        preview.hidden = !preview.hidden;
      });

      wrap.appendChild(tag);
      wrap.appendChild(preview);
    });

    return wrap;
  }

  // --- Simple Markdown Renderer ---
  function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Unordered list items
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive li in ul
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Single newlines within paragraphs
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // --- Utility ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // --- Knowledge Management ---
  const knowledgeBtn = document.getElementById('knowledgeBtn');
  const knowledgeModal = document.getElementById('knowledgeModal');
  const closeKnowledgeBtn = document.getElementById('closeKnowledgeBtn');
  const knowledgeList = document.getElementById('knowledgeList');

  let kbRequesting = false;

  async function kmFetch(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  function kmNotice(text) {
    knowledgeList.innerHTML = `<div style="color:var(--text-muted)">${escapeHtml(text)}</div>`;
  }

  async function renderKnowledgeList() {
    if (kbRequesting) return;
    kbRequesting = true;
    kmNotice('加载中…');
    try {
      const data = await kmFetch('/knowledge/list');
      const docs = data.documents || [];

      if (docs.length === 0) {
        kmNotice('知识库为空，暂无文档。');
        return;
      }

      const total = document.createElement('div');
      total.className = 'knowledge-item-meta';
      total.textContent = `共 ${docs.length} 个文档 · ${data.totalChunks} 个分块`;
      knowledgeList.textContent = '';
      knowledgeList.appendChild(total);

      docs.forEach((doc) => {
        knowledgeList.appendChild(buildKnowledgeItem(doc));
      });
    } catch (err) {
      kmNotice(`加载失败：${err.message}`);
    } finally {
      kbRequesting = false;
    }
  }

  function buildKnowledgeItem(doc) {
    const item = document.createElement('div');
    item.className = 'knowledge-item';

    const header = document.createElement('div');
    header.className = 'knowledge-item-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'knowledge-item-title';
    titleWrap.textContent = doc.source;

    const meta = document.createElement('div');
    meta.className = 'knowledge-item-meta';
    meta.textContent = `分类：${doc.category || '未分类'} · ${doc.chunkCount} 个分块`;

    const chunkList = document.createElement('div');
    chunkList.className = 'chunk-list';
    chunkList.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'knowledge-item-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '查看分块';
    openBtn.addEventListener('click', async () => {
      try {
        if (chunkList.innerHTML === '') {
          const data = await kmFetch(`/knowledge/chunks?source=${encodeURIComponent(doc.source)}`);
          (data.chunks || []).forEach((c) => {
            const pre = document.createElement('pre');
            pre.className = 'chunk-preview';
            pre.textContent = c.text;
            chunkList.appendChild(pre);
          });
        }
        chunkList.hidden = !chunkList.hidden;
      } catch (err) {
        kmNotice(`查看分块失败：${err.message}`);
      }
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', async () => {
      try {
        const data = await km(`/document/${encodeURIComponent(doc.source)}`);
        openEditor(chunkList, {
          source: doc.source,
          category: data.category || doc.category,
          content: data.content || '',
        });
      } catch (err) {
        kmNotice(`加载原文失败：${err.message}`);
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      if (!window.confirm(`确定删除「${doc.source}」？`)) return;
      try {
        await km(`/document/${encodeURIComponent(doc.source)}`, { method: 'DELETE' });
        item.remove();
      } catch (err) {
        kmNotice(`删除失败：${err.message}`);
      }
    });

    actions.append(openBtn, editBtn, delBtn);

    const headerTop = document.createElement('div');
    headerTop.className = 'knowledge-item-header';
    headerTop.append(titleWrap, actions);

    item.append(headerTop, meta, chunkList);
    return item;
  }

  function openEditor(item, doc) {
    const container = document.createElement('div');

    const textarea = document.createElement('textarea');
    textarea.className = 'knowledge-editor';
    textarea.value = doc.content;

    const categoryInput = document.createElement('input');
    categoryInput.placeholder = '分类（可选）';
    categoryInput.value = doc.category || '';

    const row = document.createElement('div');
    row.className = 'knowledge-item-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = '保存';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    row.append(saveBtn, cancelBtn);

    container.append(textarea, categoryInput, row);
    item.innerHTML = '';
    item.appendChild(container);

    cancelBtn.addEventListener('click', () => {
      renderKnowledgeList();
    });

    saveBtn.addEventListener('click', async () => {
      try {
        const body = { content: textarea.value };
        if (categoryInput.value.trim()) body.category = categoryInput.value.trim();
        await km(`/document/${encodeURIComponent(doc.source)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        kmNotice(`已保存「${doc.source}」`);
        await renderKnowledgeList();
      } catch (err) {
        kmNotice(`保存失败：${err.message}`);
      }
    });
  }

  async function km(path, options) {
    return kmFetch('/knowledge' + path, options);
  }

  function buildItemClosed(doc) {
    const div = document.createElement('div');
    div.textContent = `${doc.source}（重新加载列表以操作）`;
    return div;
  }

  if (knowledgeBtn) {
    knowledgeBtn.addEventListener('click', () => {
      knowledgeModal.hidden = false;
      renderKnowledgeList();
    });
    closeKnowledgeBtn.addEventListener('click', () => {
      knowledgeModal.hidden = true;
    });
    knowledgeModal.addEventListener('click', (e) => {
      if (e.target === knowledgeModal) knowledgeModal.hidden = true;
    });
  }

  // --- Initial focus ---
  messageInput.focus();
})();
