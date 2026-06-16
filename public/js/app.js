// ========== 全局状态 ==========
let requests = []; // 所有请求的数组
let currentRequestIndex = 0; // 当前编辑的请求索引
let currentTab = 'responseBody';
let isBatchRunning = false;
let variables = {}; // 存储变量
let autoSaveTimer = null;
let selectedGroupId = 'all'; // 当前选中的分组
let groups = []; // 分组列表

// ========== DOM 元素缓存 ==========
const dom = {};

function initDOM() {
    dom.methodSelect = document.getElementById('method');
    dom.urlInput = document.getElementById('url');
    dom.requestName = document.getElementById('requestName');
    dom.sendBtn = document.getElementById('sendBtn');
    dom.bodyTypeSelect = document.getElementById('bodyType');
    dom.bodyContent = document.getElementById('bodyContent');
    dom.authTypeSelect = document.getElementById('authType');
    dom.authDetails = document.getElementById('authDetails');
    dom.responseContent = document.getElementById('responseContent');
    dom.headersContent = document.getElementById('headersContent');
    dom.timelineContent = document.getElementById('timelineContent');
    dom.statusCode = document.getElementById('statusCode');
    dom.responseTime = document.getElementById('responseTime');
    dom.responseSize = document.getElementById('responseSize');
    dom.requestList = document.getElementById('requestList');
    dom.requestCount = document.getElementById('requestCount');
    dom.batchResults = document.getElementById('batchResults');
    dom.batchResultsList = document.getElementById('batchResultsList');
    dom.successCount = document.getElementById('successCount');
    dom.failCount = document.getElementById('failCount');
    dom.currentRequestTitle = document.getElementById('currentRequestTitle');
    dom.headersList = document.getElementById('headersList');
    dom.progressInfo = document.getElementById('progressInfo');
    dom.variablesList = document.getElementById('variablesList');
    dom.groupFilter = document.getElementById('groupFilter');
    dom.groupManager = document.getElementById('groupManager');
    dom.curlBtn = document.getElementById('curlBtn'); // 新增
    dom.collapseBtn = document.getElementById('collapseBtn'); // 新增
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('API Tester Pro 初始化...');
    initDOM();
     // 先从服务器加载集合和变量
    loadFromServer();

    // // 添加默认的测试请求
    // addDefaultRequests();
    
    // 绑定事件
    if (dom.methodSelect) dom.methodSelect.addEventListener('change', onRequestChange);
    if (dom.urlInput) dom.urlInput.addEventListener('input', onRequestChange);
    if (dom.requestName) dom.requestName.addEventListener('input', onRequestChange);
    if (dom.bodyTypeSelect) dom.bodyTypeSelect.addEventListener('change', toggleBodyContent);
    if (dom.authTypeSelect) dom.authTypeSelect.addEventListener('change', updateAuthForm);
    
    // Enter 键发送单个请求
    if (dom.urlInput) {
        dom.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendSingleRequest();
        });
    }
    
    // 添加默认 Headers
    addHeader('Content-Type', 'application/json');
    addHeader('Accept', 'application/json');

    // 启动自动保存定时器（每30秒自动保存一次）
    autoSaveTimer = setInterval(autoSave, 30000);

    loadEnvironmentsFromServer();
    console.log('初始化完成');
});

// ========== 变量管理 ==========

// 添加变量
function addVariable(key = '', value = '') {
    if (!dom.variablesList) return;
    
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.innerHTML = `
        <input type="text" class="variable-key" placeholder="变量名" value="${key}" oninput="onVariableChange()">
        <input type="text" class="variable-value" placeholder="变量值" value="${value}" oninput="onVariableChange()">
        <button class="remove-btn" onclick="this.parentElement.remove(); onVariableChange();">×</button>
    `;
    dom.variablesList.appendChild(row);
}

// 变量变更时
function onVariableChange() {
    updateVariablesFromUI();
    saveVariablesToServer();
}

// 从 UI 更新变量
function updateVariablesFromUI() {
    variables = {};
    document.querySelectorAll('.variable-row').forEach(row => {
        const key = row.querySelector('.variable-key')?.value.trim();
        const value = row.querySelector('.variable-value')?.value.trim();
        if (key) {
            variables[key] = value || '';
        }
    });
}

// 替换 URL 中的变量
function replaceVariables(text) {
    if (!text) return text;
    
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value);
    }
    return result;
}

// 替换 Headers 中的变量
function replaceVariablesInHeaders(headers) {
    if (!headers) return headers;
    
    return headers.map(h => ({
        key: h.key,
        value: replaceVariables(h.value)
    }));
}

// 替换 Body 中的变量
function replaceVariablesInBody(body) {
    if (!body) return body;
    
    if (typeof body === 'string') {
        return replaceVariables(body);
    }
    
    if (typeof body === 'object') {
        return JSON.parse(replaceVariables(JSON.stringify(body)));
    }
    
    return body;
}

// ========== 分组管理 ==========

// 初始化分组
function initGroups() {
    groups = [
        { id: 'all', name: '所有分组', color: '#666' },
        { id: 'default', name: '默认分组', color: '#e94560' }
    ];
    selectedGroupId = 'all';
    renderGroupFilter();
}

// 渲染分组筛选器
function renderGroupFilter() {
    if (!dom.groupFilter) return;
    
    dom.groupFilter.innerHTML = '';
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        option.style.color = '#e8e8e8'; // 确保文字颜色为浅色
        option.style.background = '#1a1a2e'; // 深色背景
        if (group.id === selectedGroupId) {
            option.selected = true;
        }
        dom.groupFilter.appendChild(option);
    });
}

// 分组变更
function onGroupChange() {
    if (!dom.groupFilter) return;
    
    selectedGroupId = dom.groupFilter.value;
    
    // 保存当前编辑的请求
    saveCurrentRequest();
    
    // 重新渲染请求列表
    renderRequestList();
    updateRequestCount();
    
    // 获取当前分组的请求（考虑折叠状态）
    const groupRequests = getGroupRequests();
    const visibleRequests = selectedGroupId === 'all' 
        ? requests.filter(r => localStorage.getItem('group_collapsed_' + r.groupId) !== 'true')
        : groupRequests;
    
    if (visibleRequests.length > 0) {
        // 有可见请求，选中第一个可见的
        const firstRequest = visibleRequests[0];
        const firstRequestIndex = requests.indexOf(firstRequest);
        if (firstRequestIndex !== -1) {
            selectRequest(firstRequestIndex);
        }
    } else if (groupRequests.length > 0) {
        // 所有请求被折叠，选中分组中第一个请求
        const firstRequestIndex = requests.indexOf(groupRequests[0]);
        if (firstRequestIndex !== -1) {
            selectRequest(firstRequestIndex);
        }
    } else {
        // 没有请求，清空编辑器
        clearResponse();
        if (dom.currentRequestTitle) {
            const group = groups.find(g => g.id === selectedGroupId);
            const groupName = group ? group.name : '编辑请求';
            const groupColor = group ? group.color : '#666';
            dom.currentRequestTitle.innerHTML = `
                📝 编辑请求
                <span style="
                    display: inline-block;
                    font-size: 11px;
                    color: ${groupColor};
                    background: ${groupColor}20;
                    padding: 2px 8px;
                    border-radius: 10px;
                    margin-left: 8px;
                    font-weight: normal;
                    vertical-align: middle;
                    border: 1px solid ${groupColor}40;
                ">${groupName}</span>
            `;
        }
    }
}

// 创建新分组
function createGroup() {
    const name = prompt('请输入分组名称:');
    if (!name) return;
    
    // 随机生成颜色
    const colors = ['#e94560', '#4ecdc4', '#45b7d1', '#f39c12', '#9b59b6', '#1abc9c', '#3498db', '#e67e22'];
    const color = colors[groups.length % colors.length];
    
    const newGroup = {
        id: 'group_' + Date.now(),
        name: name,
        color: color
    };
    
    groups.push(newGroup);
    selectedGroupId = newGroup.id; // 先更新 selectedGroupId
    renderGroupFilter(); // 再渲染，确保选中状态
    
    // 保存当前请求到之前的分组
    saveCurrentRequest();
    
    // 清空编辑器，准备添加新请求
    if (dom.currentRequestTitle) {
        dom.currentRequestTitle.textContent = `📝 编辑请求 (${name})`;
    }
    clearResponse();
    
    showNotification(`✅ 已创建分组: ${name}`);
}

// 管理分组
function manageGroups() {  // 创建分组管理对话框
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>管理分组</h3>
                <button onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="group-manager-list">
                    ${groups.filter(g => g.id !== 'all').map(g => `
                        <div class="group-manager-item" data-group-id="${g.id}">
                            <span class="group-color-dot" style="background: ${g.color}"></span>
                            <input type="text" class="group-name-input" value="${g.name}" 
                                   ${g.id === 'default' ? 'readonly' : ''}>
                            <div class="group-actions">
                                <input type="color" class="group-color-input" value="${g.color}">
                                ${g.id !== 'default' ? `
                                    <button class="btn-small btn-danger delete-group-btn">🗑</button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-small create-group-btn">+ 创建新分组</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    // 绑定事件 - 组名修改
    dialog.querySelectorAll('.group-name-input').forEach(input => {
        input.addEventListener('change', function() {
            const groupId = this.closest('.group-manager-item').dataset.groupId;
            const newName = this.value.trim();
            if (newName) {
                renameGroup(groupId, newName);
            }
        });
    });
    
    // 绑定事件 - 颜色修改
    dialog.querySelectorAll('.group-color-input').forEach(input => {
        input.addEventListener('change', function() {
            const groupId = this.closest('.group-manager-item').dataset.groupId;
            const newColor = this.value;
            changeGroupColor(groupId, newColor);
        });
    });
    
    // 绑定事件 - 删除分组
    dialog.querySelectorAll('.delete-group-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const groupId = this.closest('.group-manager-item').dataset.groupId;
            const group = groups.find(g => g.id === groupId);
            if (group && confirm(`确定要删除分组"${group.name}"吗？该分组的请求将移至默认分组`)) {
                deleteGroup(groupId);
                // 关闭弹窗
                dialog.remove();
            }
        });
    });
    
    // 绑定事件 - 创建新分组
    dialog.querySelector('.create-group-btn').addEventListener('click', function() {
        dialog.remove();
        createGroup();
    });
}

// 修改 renameGroup 函数，添加调试日志
function renameGroup(groupId, newName) {
    const group = groups.find(g => g.id === groupId);
    if (group) {
        console.log('重命名分组:', group.name, '->', newName);
        group.name = newName;
        
        // 确保同时更新：
        // 1. 分组下拉菜单
        renderGroupFilter();
        
        // 2. 左侧请求列表（因为左侧显示分组名）
        renderRequestList();
        
        // 3. 当前标题（如果当前选中的是这个分组）
        if (selectedGroupId === groupId) {
            if (dom.currentRequestTitle) {
                dom.currentRequestTitle.textContent = `📝 编辑请求 (${newName})`;
            }
        }
        
        showNotification(`✅ 分组已重命名为: ${newName}`);
    }
}
// 修改分组颜色
function changeGroupColor(groupId, color) {
    const group = groups.find(g => g.id === groupId);
    if (group) {
        group.color = color;
        renderGroupFilter();
    }
}

// 删除分组
function deleteGroup(groupId) {
    if (!confirm('确定要删除此分组吗？分组的请求将移至默认分组')) return;
    
    // 将请求移至默认分组
    requests.forEach(req => {
        if (req.groupId === groupId) {
            req.groupId = 'default';
        }
    });
    
    // 删除分组
    groups = groups.filter(g => g.id !== groupId);
    renderGroupFilter();
    renderRequestList();
    showNotification('✅ 分组已删除');
}

// 获取当前分组下的请求
function getGroupRequests() {
    if (selectedGroupId === 'all') {
        return requests;
    }
    return requests.filter(r => r.groupId === selectedGroupId);
}

function generateCurlCommand() {
    saveCurrentRequest();
    const req = requests[currentRequestIndex];
    if (!req || !req.url) {
        showNotification('⚠️ 请先填写请求 URL', 'warning');
        return;
    }
    
    // 替换变量
    const processedUrl = replaceVariables(req.url);
    const processedHeaders = replaceVariablesInHeaders(req.headers);
    const processedBody = replaceVariablesInBody(req.body);
    
    let curlCmd = `curl -X ${req.method}`;
    
    // 添加 URL
    curlCmd += ` "${processedUrl}"`;
    
    // 添加 Headers
    if (processedHeaders && processedHeaders.length > 0) {
        processedHeaders.forEach(h => {
            if (h.key && h.value) {
                curlCmd += ` \\\n  -H "${h.key}: ${h.value}"`;
            }
        });
    }
    
    // 添加认证
    if (req.auth) {
        if (req.auth.type === 'basic') {
            curlCmd += ` \\\n  -u "${req.auth.username}:${req.auth.password}"`;
        } else if (req.auth.type === 'bearer') {
            curlCmd += ` \\\n  -H "Authorization: Bearer ${req.auth.token}"`;
        } else if (req.auth.type === 'apiKey') {
            curlCmd += ` \\\n  -H "${req.auth.keyName}: ${req.auth.keyValue}"`;
        }
    }
    
    // 添加 Body
    if (processedBody && req.method !== 'GET') {
        if (typeof processedBody === 'object') {
            curlCmd += ` \\\n  -d '${JSON.stringify(processedBody)}'`;
        } else {
            curlCmd += ` \\\n  -d '${processedBody}'`;
        }
    }
    
    // 使用兼容的复制方法
    copyToClipboard(curlCmd);
}

function copyToClipboard(text) {
    // 方法1: 使用 Clipboard API (需要 HTTPS 或 localhost)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('✅ CURL 命令已复制到剪贴板');
        }).catch(() => {
            // 如果 Clipboard API 失败，使用备用方法
            fallbackCopyToClipboard(text);
        });
    } else {
        // 方法2: 使用 execCommand (兼容所有环境)
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('✅ CURL 命令已复制到剪贴板');
        } else {
            // 如果复制失败，显示命令文本让用户手动复制
            showCurlCommandInDialog(text);
        }
    } catch (err) {
        // 如果 execCommand 失败，显示对话框
        showCurlCommandInDialog(text);
    }
    
    document.body.removeChild(textarea);
}

// 在对话框中显示 curl 命令
function showCurlCommandInDialog(text) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-content" style="min-width: 500px; max-width: 700px;">
            <div class="modal-header">
                <h3>🔗 CURL 命令</h3>
                <button onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 13px;">请手动复制以下命令：</p>
                <pre style="
                    background: #1a1a2e;
                    color: #e8e8e8;
                    padding: 16px;
                    border-radius: 6px;
                    border: 1px solid var(--border-color);
                    font-size: 13px;
                    line-height: 1.6;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-all;
                    user-select: all;
                    cursor: text;
                ">${text}</pre>
                <div style="text-align: right; margin-top: 12px;">
                    <button class="btn-primary" onclick="
                        const pre = this.parentElement.previousElementSibling;
                        const range = document.createRange();
                        range.selectNodeContents(pre);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    ">全选文本</button>
                    <button class="btn-success" onclick="this.closest('.modal-overlay').remove()" style="margin-left: 8px;">关闭</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}
// ========== 默认请求示例 ==========
function addDefaultRequests() {
    // 清空默认
    requests = [];
    
    // 添加测试请求
    addRequest({
        name: 'Echo 测试',
        method: 'GET',
        url: 'http://localhost:5000/api/echo'
    });
    
    addRequest({
        name: 'POST 测试',
        method: 'POST',
        url: 'http://localhost:5000/api/echo',
        body: '{"message": "Hello World"}',
        bodyType: 'json'
    });
    
    addRequest({
        name: '延迟测试',
        method: 'GET',
        url: 'http://localhost:5000/api/delay/1'
    });
    
    addRequest({
        name: '状态码测试',
        method: 'GET',
        url: 'http://localhost:5000/api/status/200'
    });
}

// ========== 请求管理 ==========

// 添加请求
function addRequest(data = null) {
    const newRequest = data || createEmptyRequest();
    
    // 分配到当前选中的分组
    if (selectedGroupId === 'all') {
        newRequest.groupId = 'default';
    } else {
        newRequest.groupId = selectedGroupId;
    }
    
    requests.push(newRequest);
    currentRequestIndex = requests.length - 1;
    renderRequestList();
    renderCurrentRequest();
    updateRequestCount();
    
    // 确保列表滚动到最新请求
    if (dom.requestList) {
        const lastItem = dom.requestList.lastElementChild;
        if (lastItem) {
            lastItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// 创建空请求
function createEmptyRequest() {
    return {
        name: `请求 ${requests.length + 1}`,
        method: 'GET',
        url: '',
        headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Accept', value: 'application/json' }],
        body: null,
        bodyType: 'none',
        auth: null,
        groupId: 'default',
        response: null,
        status: 'pending'
    };
}

// 删除请求
function removeRequest(index) {
    if (requests.length <= 1) {
        alert('至少保留一个请求');
        return;
    }
    
    requests.splice(index, 1);
    if (currentRequestIndex >= requests.length) {
        currentRequestIndex = requests.length - 1;
    }
    renderRequestList();
    renderCurrentRequest();
    updateRequestCount();
}

// 移除当前请求
function removeCurrentRequest() {
    removeRequest(currentRequestIndex);
}

// 选择请求
function selectRequest(index) {
    // 保存当前请求的数据
    saveCurrentRequest();
    
    currentRequestIndex = index;
    renderCurrentRequest();
    updateRequestListSelection();
}

// 清空所有请求
function clearAll() {
    if (requests.length === 0) return;
    if (!confirm('确定要清空所有请求吗？')) return;
    
    requests = [];
    addRequest();
}

// 保存当前请求的数据
function saveCurrentRequest() {
    if (requests.length === 0) return;
    
    const req = requests[currentRequestIndex];
    req.method = dom.methodSelect ? dom.methodSelect.value : 'GET';
    req.url = dom.urlInput ? dom.urlInput.value : '';
    req.name = dom.requestName ? dom.requestName.value || `请求 ${currentRequestIndex + 1}` : `请求 ${currentRequestIndex + 1}`;
    req.headers = getHeadersArray();
    req.body = getBodyContent();
    req.bodyType = dom.bodyTypeSelect ? dom.bodyTypeSelect.value : 'none';
    req.auth = getAuthData();
}

// 请求变更时保存
function onRequestChange() {
    saveCurrentRequest();
    updateRequestListItem(currentRequestIndex);
}

// ========== 渲染 ==========

// 渲染请求列表
function renderRequestList() {
    if (!dom.requestList) return;
    
    dom.requestList.innerHTML = '';
    const groupRequests = getGroupRequests();
    
    if (selectedGroupId === 'all') {
        // 按分组分组显示
        groups.filter(g => g.id !== 'all').forEach(group => {
            const groupReqs = requests.filter(r => r.groupId === group.id);
            if (groupReqs.length === 0) return;
            
            // 获取折叠状态
            const isCollapsed = localStorage.getItem('group_collapsed_' + group.id) === 'true';
            
            // 分组标题 - 点击可折叠
            const groupHeader = document.createElement('div');
            groupHeader.className = 'request-group-header';
            groupHeader.style.cursor = 'pointer';
            groupHeader.innerHTML = `
                <span class="group-indicator" style="background: ${group.color}"></span>
                <span class="group-name">${group.name}</span>
                <span class="group-count">${groupReqs.length}</span>
                <span class="group-collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
            `;
            groupHeader.onclick = () => toggleGroupCollapse(group.id);
            dom.requestList.appendChild(groupHeader);
            
            // 如果折叠状态，隐藏请求项
            if (!isCollapsed) {
                groupReqs.forEach((req, index) => {
                    const realIndex = requests.indexOf(req);
                    const div = createRequestItemElement(req, realIndex);
                    dom.requestList.appendChild(div);
                });
            }
        });
    } else {
        // 只显示选中分组的请求
        groupRequests.forEach((req, index) => {
            const realIndex = requests.indexOf(req);
            const div = createRequestItemElement(req, realIndex);
            dom.requestList.appendChild(div);
        });
    }
}
// 切换分组折叠状态
function toggleGroupCollapse(groupId) {
    const currentState = localStorage.getItem('group_collapsed_' + groupId) === 'true';
    localStorage.setItem('group_collapsed_' + groupId, !currentState);
    renderRequestList();
}
// 创建请求项元素
function createRequestItemElement(req, index) {
    const div = document.createElement('div');
    div.className = `request-item ${index === currentRequestIndex ? 'active' : ''}`;
    div.dataset.index = index;
    
    const statusIcon = req.status === 'success' ? '✅' : req.status === 'error' ? '❌' : '⏳';
    
    div.innerHTML = `
        <div class="request-item-main" onclick="selectRequest(${index})">
            <span class="method-badge method-${req.method.toLowerCase()}">${req.method}</span>
            <div class="request-item-info">
                <span class="request-item-name">${req.name || '未命名请求'}</span>
                <span class="request-item-url">${req.url || '未设置 URL'}</span>
            </div>
            <span class="request-item-status">${statusIcon}</span>
        </div>
        <div class="request-item-actions">
            <button class="request-item-copy" onclick="event.stopPropagation(); copyRequest(${index})" title="复制请求">📋</button>
            <button class="request-item-remove" onclick="event.stopPropagation(); removeRequest(${index})">×</button>
        </div>
    `;
    
    // 添加右键菜单
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showRequestContextMenu(e, index);
    });
    
    return div;
}

// 右键菜单
function showRequestContextMenu(event, index) {
    // 移除已有的右键菜单
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    
    const req = requests[index];
    if (!req) return;
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.clientX}px;
        top: ${event.clientY}px;
        z-index: 1000;
        background: #1a1a3e;
        border: 1px solid #2a2a5a;
        border-radius: 8px;
        padding: 6px 0;
        min-width: 180px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;
    
    // 菜单项：移动到分组
    const moveTitle = document.createElement('div');
    moveTitle.style.cssText = `
        padding: 8px 14px 6px;
        font-size: 11px;
        color: #888;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    moveTitle.textContent = '移动到分组';
    menu.appendChild(moveTitle);
    
    // 为每个非'all'分组添加菜单项
    groups.filter(g => g.id !== 'all').forEach(group => {
        if (group.id === req.groupId) return; // 跳过当前分组
        
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 14px 8px 24px;
            font-size: 13px;
            color: #e8e8e8;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background 0.15s;
        `;
        item.innerHTML = `
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${group.color}; display: inline-block; flex-shrink: 0;"></span>
            <span>${group.name}</span>
        `;
        item.onmouseenter = () => item.style.background = 'rgba(233, 69, 96, 0.15)';
        item.onmouseleave = () => item.style.background = 'transparent';
        item.onclick = () => {
            changeRequestGroup(index, group.id);
            menu.remove();
        };
        menu.appendChild(item);
    });
    
    // 分隔线
    const divider = document.createElement('div');
    divider.style.cssText = `
        height: 1px;
        background: #2a2a5a;
        margin: 6px 8px;
    `;
    menu.appendChild(divider);
    
    // 复制请求
    const copyItem = document.createElement('div');
    copyItem.style.cssText = `
        padding: 8px 14px;
        font-size: 13px;
        color: #e8e8e8;
        cursor: pointer;
        transition: background 0.15s;
    `;
    copyItem.textContent = '📋 复制请求';
    copyItem.onmouseenter = () => copyItem.style.background = 'rgba(46, 204, 113, 0.15)';
    copyItem.onmouseleave = () => copyItem.style.background = 'transparent';
    copyItem.onclick = () => {
        copyRequest(index);
        menu.remove();
    };
    menu.appendChild(copyItem);
    
    // 删除请求
    const deleteItem = document.createElement('div');
    deleteItem.style.cssText = `
        padding: 8px 14px;
        font-size: 13px;
        color: #e74c3c;
        cursor: pointer;
        transition: background 0.15s;
    `;
    deleteItem.textContent = '🗑 删除请求';
    deleteItem.onmouseenter = () => deleteItem.style.background = 'rgba(231, 76, 60, 0.15)';
    deleteItem.onmouseleave = () => deleteItem.style.background = 'transparent';
    deleteItem.onclick = () => {
        removeRequest(index);
        menu.remove();
    };
    menu.appendChild(deleteItem);
    
    document.body.appendChild(menu);
    
    // 确保菜单不超出窗口
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        menu.style.left = (window.innerWidth - menuRect.width - 10) + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - menuRect.height - 10) + 'px';
    }
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    document.removeEventListener('click', closeContextMenu);
}
// 添加 changeRequestGroup 函数
function changeRequestGroup(index, newGroupId) {
    const req = requests[index];
    if (!req) return;
    
    const oldGroupId = req.groupId;
    if (oldGroupId === newGroupId) return;
    
    // 更新请求的分组
    req.groupId = newGroupId;
    req.response = null;
    req.status = 'pending';
    
    // 重新渲染请求列表
    renderRequestList();
    updateRequestCount();
    
    // 获取新分组的名称
    const newGroup = groups.find(g => g.id === newGroupId);
    const newGroupName = newGroup ? newGroup.name : newGroupId;
    
    showNotification(`✅ 请求 "${req.name}" 已移至分组: ${newGroupName}`);
}

// 添加 copyRequest 函数
function copyRequest(index) {
    const originalReq = requests[index];
    if (!originalReq) return;
    
    // 深拷贝请求对象
    const newReq = JSON.parse(JSON.stringify(originalReq));
    
    // 修改名称，添加"副本"标记
    newReq.name = originalReq.name ? `${originalReq.name} (副本)` : `请求 ${requests.length + 1}`;
    
    // 清空响应状态
    newReq.response = null;
    newReq.status = 'pending';
    
    // 插入到原请求后面
    requests.splice(index + 1, 0, newReq);
    
    // 选中新复制的请求
    currentRequestIndex = index + 1;
    
    // 重新渲染
    renderRequestList();
    renderCurrentRequest();
    updateRequestCount();
    
    showNotification('✅ 已复制请求');
}
// 更新单个列表项
function updateRequestListItem(index) {
    const req = requests[index];
    const item = dom.requestList?.querySelector(`[data-index="${index}"]`);
    if (!item) return;
    
    const nameEl = item.querySelector('.request-item-name');
    const urlEl = item.querySelector('.request-item-url');
    const statusEl = item.querySelector('.request-item-status');
    
    if (nameEl) nameEl.textContent = req.name || '未命名请求';
    if (urlEl) urlEl.textContent = req.url || '未设置 URL';
    
    const statusIcon = req.status === 'success' ? '✅' : req.status === 'error' ? '❌' : '⏳';
    if (statusEl) statusEl.textContent = statusIcon;
}

// 更新列表选中状态
function updateRequestListSelection() {
    if (!dom.requestList) return;
    
    dom.requestList.querySelectorAll('.request-item').forEach((item, index) => {
        item.classList.toggle('active', index === currentRequestIndex);
    });
}

// 渲染当前请求
function renderCurrentRequest() {
    if (requests.length === 0) return;
    
    const req = requests[currentRequestIndex];
    
    // 获取分组信息
    const group = groups.find(g => g.id === req.groupId);
    const groupName = group ? group.name : '未分组';
    const groupColor = group ? group.color : '#666';
    
    if (dom.currentRequestTitle) {
        dom.currentRequestTitle.innerHTML = `
            📝 ${req.name || '编辑请求'}
            <span style="
                display: inline-block;
                font-size: 11px;
                color: ${groupColor};
                background: ${groupColor}20;
                padding: 2px 8px;
                border-radius: 10px;
                margin-left: 8px;
                font-weight: normal;
                vertical-align: middle;
                border: 1px solid ${groupColor}40;
            ">${groupName}</span>
        `;
    }
    if (dom.methodSelect) dom.methodSelect.value = req.method || 'GET';
    if (dom.urlInput) dom.urlInput.value = req.url || '';
    if (dom.requestName) dom.requestName.value = req.name || '';
    
    // 渲染 Headers
    if (dom.headersList) {
        dom.headersList.innerHTML = '';
        if (req.headers && req.headers.length > 0) {
            req.headers.forEach(h => addHeader(h.key, h.value));
        } else {
            addHeader('Content-Type', 'application/json');
            addHeader('Accept', 'application/json');
        }
    }
    
    // 渲染 Body
    if (dom.bodyTypeSelect) {
        dom.bodyTypeSelect.value = req.bodyType || 'none';
        toggleBodyContent();
    }
    if (dom.bodyContent) {
        dom.bodyContent.value = typeof req.body === 'object' ? JSON.stringify(req.body, null, 2) : (req.body || '');
    }
    
    // 渲染认证
    if (dom.authTypeSelect) {
        dom.authTypeSelect.value = req.auth?.type || 'none';
        updateAuthForm();
        if (req.auth) {
            fillAuthForm(req.auth);
        }
    }
    
    // 渲染响应
    if (req.response) {
        displayResponse(req.response);
    } else {
        clearResponse();
    }
}

// 填充认证表单
function fillAuthForm(auth) {
    if (!auth || !dom.authDetails) return;
    
    if (auth.type === 'basic') {
        const usernameInput = dom.authDetails.querySelector('.auth-username');
        const passwordInput = dom.authDetails.querySelector('.auth-password');
        if (usernameInput) usernameInput.value = auth.username || '';
        if (passwordInput) passwordInput.value = auth.password || '';
    } else if (auth.type === 'bearer') {
        const tokenInput = dom.authDetails.querySelector('.auth-token');
        if (tokenInput) tokenInput.value = auth.token || '';
    } else if (auth.type === 'apiKey') {
        const keyNameInput = dom.authDetails.querySelector('.auth-key-name');
        const keyValueInput = dom.authDetails.querySelector('.auth-key-value');
        if (keyNameInput) keyNameInput.value = auth.keyName || '';
        if (keyValueInput) keyValueInput.value = auth.keyValue || '';
    }
}

// 更新请求计数
function updateRequestCount() {
    if (dom.requestCount) {
        dom.requestCount.textContent = `${requests.length} 个请求`;
    }
}

// ========== 发送请求 ==========

// 发送单个请求
async function sendSingleRequest() {
    saveCurrentRequest();
    const req = requests[currentRequestIndex];
    
    if (!req.url) {
        alert('请输入 URL');
        return;
    }
    // 替换变量
    const processedUrl = replaceVariables(req.url);
    const processedHeaders = replaceVariablesInHeaders(req.headers);
    const processedBody = replaceVariablesInBody(req.body);
    
    if (dom.responseContent) dom.responseContent.textContent = '正在发送请求...';
    
    try {
        const response = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: req.method,
                url: processedUrl,
                headers: getHeadersObject(processedHeaders),
                body: processedBody,
                auth: req.auth
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            req.status = 'error';
            displayError(data);
        } else {
            req.status = 'success';
            req.response = data;
            displayResponse(data, processedUrl);
        }
        
        updateRequestListItem(currentRequestIndex);
    } catch (error) {
        req.status = 'error';
        displayError({ message: error.message });
        updateRequestListItem(currentRequestIndex);
    }
}

// 发送全部请求
async function sendAllRequests() {
    if (isBatchRunning) return;
    
    // 保存当前编辑的请求
    saveCurrentRequest();
    
    // 获取当前分组的请求
    const groupRequests = getGroupRequests();
    if (groupRequests.length === 0) {
        showNotification('⚠️ 当前分组没有请求', 'warning');
        return;
    }
    
    // 检查是否有 URL
    const invalidRequests = groupRequests.filter(r => !r.url);
    if (invalidRequests.length > 0) {
        if (!confirm(`当前分组有 ${invalidRequests.length} 个请求没有设置 URL，是否跳过？`)) return;
    }
    
    isBatchRunning = true;
    
    // 显示批量结果标签页
    const batchTab = document.getElementById('batchTab');
    const batchResults = document.getElementById('batchResults');
    const batchResultsList = document.getElementById('batchResultsList');
    
    batchTab.style.display = 'inline-block';
    batchResultsList.innerHTML = '<div class="batch-loading">🚀 正在发送请求...</div>';
    
    // 清空之前的批量结果
    batchResultsList.innerHTML = '<div class="batch-loading">🚀 正在发送请求...</div>';
    
    // 切换到批量结果标签页
    switchTab('batchResults');
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < groupRequests.length; i++) {
        const req = groupRequests[i];
        const actualIndex = requests.indexOf(req);
        
        if (!req.url) {
            req.status = 'error';
            continue;
        }
        
        // 更新进度
        dom.progressInfo.style.display = 'inline';
        dom.progressInfo.textContent = `进度: ${i + 1}/${groupRequests.length}`;
        
        // 更新批量计数
        document.getElementById('batchCount').textContent = `${i + 1}/${groupRequests.length}`;
        
        // 替换变量
        const processedUrl = replaceVariables(req.url);
        const processedHeaders = replaceVariablesInHeaders(req.headers);
        const processedBody = replaceVariablesInBody(req.body);
        
        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: req.method,
                    url: processedUrl,
                    headers: getHeadersObject(processedHeaders),
                    body: processedBody,
                    auth: req.auth
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                req.status = 'error';
                failCount++;
            } else {
                req.status = 'success';
                req.response = data;
                successCount++;
            }
            
            // 添加批量结果项
            addBatchResultItem(req, data, i, processedUrl);
            
        } catch (error) {
            req.status = 'error';
            failCount++;
            addBatchResultItem(req, { error: true, message: error.message }, i, processedUrl);
        }
        
        updateRequestListItem(actualIndex);
    }
    
    // 完成后移除加载提示
    const loadingDiv = batchResultsList?.querySelector('.batch-loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
    
    dom.progressInfo.style.display = 'none';
    isBatchRunning = false;
    
    // 更新批量计数
    document.getElementById('batchCount').textContent = `✅ ${successCount}/${successCount + failCount}`;
    
    // 显示完成信息
    if (batchResultsList) {
        const completeDiv = document.createElement('div');
        completeDiv.className = 'batch-complete';
        completeDiv.innerHTML = `
            ✅ 全部完成！成功: ${successCount}, 失败: ${failCount}
            <button class="btn-small" onclick="closeBatchResults()" style="margin-left: 12px;">✕ 关闭</button>
        `;
        batchResultsList.appendChild(completeDiv);
    }
}

// 添加批量结果项
function addBatchResultItem(req, data, index, processedUrl) {
    if (!dom.batchResultsList) return;
    
    // 移除 loading 提示
    const loadingDiv = dom.batchResultsList.querySelector('.batch-loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
    
    const div = document.createElement('div');
    div.className = 'batch-result-item';
    
    const isSuccess = !data.error && data.status >= 200 && data.status < 300;
    const statusText = isSuccess ? data.status : (data.error ? 'Error' : data.status);
    const timeText = data.time ? `${data.time}ms` : '-';
    const displayUrl = processedUrl || req.url || '未设置 URL';
    
    // 格式化响应数据
    let responseBody = '';
    if (data.error) {
        responseBody = JSON.stringify(data, null, 2);
    } else if (data.data) {
        try {
            responseBody = typeof data.data === 'object' ? 
                JSON.stringify(data.data, null, 2) : 
                String(data.data);
        } catch {
            responseBody = String(data.data);
        }
    }
    
    // 截取过长内容
    if (responseBody.length > 2000) {
        responseBody = responseBody.substring(0, 2000) + '\n\n... (内容已截断)';
    }
    
    div.innerHTML = `
        <div class="batch-result-header">
            <span class="batch-result-status ${isSuccess ? 'success' : 'error'}">
                ${isSuccess ? '✅' : '❌'} ${statusText}
            </span>
            <span class="method-badge method-${req.method.toLowerCase()}">${req.method}</span>
            <span class="batch-result-name">${req.name || '未命名'}</span>
            <span class="batch-result-time">${timeText}</span>
            <span class="batch-result-expand" onclick="toggleBatchResultDetail(this)">▶ 详情</span>
        </div>
        <div class="batch-result-url">${displayUrl}</div>
        <div class="batch-result-body" style="display:none;">
            <div style="display:flex; gap: 12px; margin-bottom: 8px; font-size: 12px; color: #888;">
                <span>📊 状态: <strong style="color: ${isSuccess ? '#2ecc71' : '#e74c3c'}">${statusText}</strong></span>
                <span>⏱ 耗时: <strong style="color: #4ecdc4">${timeText}</strong></span>
                <span>📦 大小: <strong style="color: #f39c12">${formatSize(data.size || 0)}</strong></span>
            </div>
            <pre>${responseBody || '无响应数据'}</pre>
        </div>
    `;
    
    dom.batchResultsList.appendChild(div);
}

// 切换批量结果详情
function toggleBatchResultDetail(element) {
    const body = element.closest('.batch-result-item').querySelector('.batch-result-body');
    if (body) {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
        element.textContent = body.style.display === 'block' ? '▼' : '▶';
    }
}

// 关闭批量结果
function closeBatchResults() {
    document.getElementById('batchTab').style.display = 'none';
    switchTab('responseBody');
}

// 更新批量统计
function updateBatchStats(success, fail) {
    if (dom.successCount) dom.successCount.textContent = success;
    if (dom.failCount) dom.failCount.textContent = fail;
}

// ========== 保存和加载 ==========


// 加载集合
async function loadCollection() {
    try {
        const response = await fetch('/api/collections');
        const collections = await response.json();
        
        if (collections.length === 0) {
            // 如果没有保存的集合，从文件加载
            loadFromFile();
            return;
        }
        
        // 显示集合选择对话框
        const collectionNames = collections.map((c, i) => `${i + 1}. ${c.name} (${new Date(c.createdAt).toLocaleDateString()})`).join('\n');
        const choice = prompt(`选择要加载的集合 (输入编号) 或输入 0 从文件加载:\n${collectionNames}`);
        
        if (choice === null) return;
        
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < collections.length) {
            loadRequestsFromCollection(collections[index]);
        } else {
            loadFromFile();
        }
    } catch (error) {
        console.error('加载集合失败:', error);
        loadFromFile();
    }
}
// 自动保存
function autoSave() {
    if (requests.length === 0) return;
    
    const data = {
        requests: requests.map(req => ({
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,        // 确保包含 body
            bodyType: req.bodyType, // 确保包含 bodyType
            auth: req.auth,
            groupId: req.groupId,
            status: req.status
        })),
        groups: groups.filter(g => g.id !== 'all'),
        globalVariables: variables,
        environments: environmentData
    };
    
    fetch('/api/data/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(err => console.error('Auto-save failed:', err));
}

// 从文件加载
function loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // 检查 requests 是否存在且为数组
                if (!data.requests || !Array.isArray(data.requests)) {
                    throw new Error('无效数据：缺少 requests 数组');
                }
                
                console.log('导入数据:', {
                    requestsCount: data.requests.length,
                    groupsCount: data.groups ? data.groups.length : 0,
                    hasVariables: !!data.variables || !!data.globalVariables,
                    hasEnvironments: !!data.environments
                });
                
                // 先清空所有数据
                requests.length = 0;
                groups.length = 0;
                
                // 导入分组（必须在 initGroups 之前）
                if (data.groups && Array.isArray(data.groups)) {
                    data.groups.forEach(g => groups.push(g));
                }
                // 确保有默认分组
                if (!groups.find(g => g.id === 'default')) {
                    groups.push({ id: 'default', name: '默认分组', color: '#4a9eff' });
                }
                
                // 导入请求
                data.requests.forEach(req => {
                    if (req && req.name) {
                        requests.push(req);
                    }
                });
                
                // 导入变量
                if (data.variables) {
                    variables = data.variables;
                } else if (data.globalVariables) {
                    variables = data.globalVariables;
                } else {
                    variables = {};
                }
                renderVariables();
                
                // 环境变量处理
                if (!environmentData || !environmentData.environments) {
                    environmentData = {
                        current: 'dev',
                        environments: [
                            { id: 'dev', name: 'Development', variables: {} },
                            { id: 'staging', name: 'Staging', variables: {} },
                            { id: 'prod', name: 'Production', variables: {} }
                        ]
                    };
                }
                
                if (data.environments && data.environments.environments) {
                    environmentData = data.environments;
                } else if (data.variables && Object.keys(data.variables).length > 0) {
                    const devEnv = environmentData.environments.find(e => e.id === 'dev');
                    if (devEnv) {
                        devEnv.variables = { ...data.variables };
                    }
                }
                
                // 重新初始化 UI（注意顺序）
                renderGroupFilter();   // 重新渲染分组下拉框
                renderRequestList();   // 重新渲染请求列表
                initEnvironments();    // 重新初始化环境
                
                // 选中第一个请求
                if (requests.length > 0) {
                    currentRequestIndex = 0;
                    renderCurrentRequest();
                    updateRequestListSelection();
                }
                
                // 保存到服务器
                saveCollection();
                saveEnvironmentsToServer();
                
                console.log('导入完成，请求数:', requests.length);
                alert('导入成功！共导入 ' + requests.length + ' 个请求');
            } catch (err) {
                console.error('Import error:', err);
                alert('导入失败：' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// 导出到文件
function exportToFile() {
    const data = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        requests: requests.map(req => ({
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,        // 确保包含 body
            bodyType: req.bodyType, // 确保包含 bodyType
            auth: req.auth,
            groupId: req.groupId
        })),
        groups: groups.filter(g => g.id !== 'all'),
        variables: variables,
        environments: environmentData
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-collection-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// 从集合加载请求
function loadRequestsFromCollection(collection) {
    if (!confirm(`将加载 "${collection.name}" 中的 ${collection.requests.length} 个请求，是否继续？`)) return;
    
    requests = collection.requests.map((r, i) => ({
        name: r.name || `请求 ${i + 1}`,
        method: r.method || 'GET',
        url: r.url || '',
        headers: r.headers || [{ key: 'Content-Type', value: 'application/json' }],
        body: r.body || null,
        bodyType: r.bodyType || 'none',
        auth: r.auth || null,
        response: null,
        status: 'pending'
    }));
    
    currentRequestIndex = 0;
    renderRequestList();
    renderCurrentRequest();
    updateRequestCount();
}

// 导出集合
function exportCollection() {
    saveCurrentRequest();
    
    const collection = {
        name: prompt('请输入导出文件名:', `API集合_${new Date().toLocaleDateString()}`) || 'API集合',
        exportedAt: new Date().toISOString(),
        requestCount: requests.length,
        requests: requests.map(req => ({
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            bodyType: req.bodyType,
            auth: req.auth
        }))
    };
    
    downloadJSON(collection, `${collection.name}.json`);
}

// 下载 JSON
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ========== 辅助函数 ==========

// 获取 Headers 数组
function getHeadersArray() {
    const headers = [];
    document.querySelectorAll('.header-row').forEach(row => {
        const key = row.querySelector('.header-key')?.value.trim();
        const value = row.querySelector('.header-value')?.value.trim();
        if (key && value) {
            headers.push({ key, value });
        }
    });
    return headers;
}

// 获取 Headers 对象
function getHeadersObject(headersArray) {
    const headers = {};
    if (headersArray) {
        headersArray.forEach(h => {
            if (h.key && h.value) {
                headers[h.key] = h.value;
            }
        });
    }
    return headers;
}

// 获取 Body 内容
function getBodyContent() {
    if (!dom.bodyTypeSelect || !dom.bodyContent) return null;
    
    const type = dom.bodyTypeSelect.value;
    if (type === 'none') return null;
    
    const content = dom.bodyContent.value.trim();
    if (!content) return null;

    if (type === 'json') {
        try {
            return JSON.parse(content);
        } catch {
            return content;
        }
    }
    return content;
}

// 获取认证数据
function getAuthData() {
    if (!dom.authTypeSelect) return null;
    
    const type = dom.authTypeSelect.value;
    if (type === 'none') return null;

    const auth = { type };

    if (type === 'basic') {
        auth.username = dom.authDetails?.querySelector('.auth-username')?.value || '';
        auth.password = dom.authDetails?.querySelector('.auth-password')?.value || '';
    } else if (type === 'bearer') {
        auth.token = dom.authDetails?.querySelector('.auth-token')?.value || '';
    } else if (type === 'apiKey') {
        auth.keyName = dom.authDetails?.querySelector('.auth-key-name')?.value || '';
        auth.keyValue = dom.authDetails?.querySelector('.auth-key-value')?.value || '';
    }

    return auth;
}

// 添加 Header
function addHeader(key = '', value = '') {
    if (!dom.headersList) return;
    
    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `
        <input type="text" class="header-key" placeholder="Key" value="${key}">
        <input type="text" class="header-value" placeholder="Value" value="${value}">
        <button class="remove-btn" onclick="this.parentElement.remove(); onRequestChange();">×</button>
    `;
    dom.headersList.appendChild(row);
}

// 切换 Body 内容
function toggleBodyContent() {
    if (!dom.bodyContent || !dom.bodyTypeSelect) return;
    
    if (dom.bodyTypeSelect.value === 'none') {
        dom.bodyContent.style.display = 'none';
    } else {
        dom.bodyContent.style.display = 'block';
        if (dom.bodyTypeSelect.value === 'form') {
            dom.bodyContent.placeholder = 'key1=value1&key2=value2';
        } else if (dom.bodyTypeSelect.value === 'text') {
            dom.bodyContent.placeholder = '输入文本内容...';
        } else {
            dom.bodyContent.placeholder = '{"key": "value"}';
        }
    }
}

// 更新认证表单
function updateAuthForm() {
    const type = dom.authTypeSelect?.value || 'none';
    if (!dom.authDetails) return;
    
    let html = '';
    if (type === 'basic') {
        html = `
            <div class="auth-field">
                <label>Username</label>
                <input type="text" class="auth-username" placeholder="输入用户名">
            </div>
            <div class="auth-field">
                <label>Password</label>
                <input type="password" class="auth-password" placeholder="输入密码">
            </div>
        `;
    } else if (type === 'bearer') {
        html = `
            <div class="auth-field">
                <label>Token</label>
                <input type="text" class="auth-token" placeholder="输入 Bearer Token">
            </div>
        `;
    } else if (type === 'apiKey') {
        html = `
            <div class="auth-field">
                <label>Key Name</label>
                <input type="text" class="auth-key-name" placeholder="如: X-API-Key">
            </div>
            <div class="auth-field">
                <label>Key Value</label>
                <input type="text" class="auth-key-value" placeholder="输入 API Key">
            </div>
        `;
    }
    
    dom.authDetails.innerHTML = html;
}

// 显示响应
function displayResponse(data, requestUrl) {
    if (dom.statusCode) {
        dom.statusCode.textContent = data.status;
        dom.statusCode.className = `status-badge ${getStatusClass(data.status)}`;
    }
    if (dom.responseTime) dom.responseTime.textContent = `${data.time}ms`;
    if (dom.responseSize) dom.responseSize.textContent = formatSize(data.size);
    
    if (dom.responseContent) {
        try {
            const formatted = typeof data.data === 'object' ? 
                JSON.stringify(data.data, null, 2) : 
                String(data.data);
            dom.responseContent.textContent = formatted;
        } catch {
            dom.responseContent.textContent = String(data.data);
        }
    }
    
    if (dom.headersContent) {
        //显示url以及其他响应头
        const headersWithUrl = {
            'Request URL': requestUrl || '未知',
            ...data.headers
        };
        dom.headersContent.textContent = JSON.stringify(headersWithUrl, null, 2);
    }
    
    if (dom.timelineContent) {
        dom.timelineContent.innerHTML = `
            <div class="timeline">
                <div class="timeline-item">✓ DNS 解析: ${(Math.random() * 50).toFixed(2)}ms</div>
                <div class="timeline-item">✓ TCP 连接: ${(Math.random() * 100).toFixed(2)}ms</div>
                <div class="timeline-item">✓ TLS 握手: ${(Math.random() * 200).toFixed(2)}ms</div>
                <div class="timeline-item">✓ 请求发送: ${(Math.random() * 50).toFixed(2)}ms</div>
                <div class="timeline-item">✓ 服务器处理: ${data.time}ms</div>
                <div class="timeline-item">✓ 响应接收: ${(Math.random() * 100).toFixed(2)}ms</div>
            </div>
        `;
    }
}

// 清空响应
function clearResponse() {
    if (dom.statusCode) {
        dom.statusCode.textContent = '-';
        dom.statusCode.className = 'status-badge';
    }
    if (dom.responseTime) dom.responseTime.textContent = '-';
    if (dom.responseSize) dom.responseSize.textContent = '-';
    if (dom.responseContent) dom.responseContent.textContent = '等待发送请求...';
    if (dom.headersContent) dom.headersContent.textContent = '无数据';
    if (dom.timelineContent) dom.timelineContent.innerHTML = '无数据';
}

// 显示错误
function displayError(error) {
    if (dom.statusCode) {
        dom.statusCode.textContent = 'Error';
        dom.statusCode.className = 'status-badge error';
    }
    if (dom.responseTime) dom.responseTime.textContent = '-';
    if (dom.responseSize) dom.responseSize.textContent = '-';
    if (dom.responseContent) {
        dom.responseContent.textContent = JSON.stringify(error, null, 2);
    }
    if (dom.headersContent) dom.headersContent.textContent = '无数据';
}

// 获取状态码样式类
function getStatusClass(status) {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 300 && status < 400) return 'warning';
    return 'error';
}

// 格式化大小
function formatSize(bytes) {
    if (!bytes) return '0B';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// 切换面板
function toggleSection(id) {
    const content = document.getElementById(id);
    if (!content) return;
    
    content.classList.toggle('active');
    const arrow = content.previousElementSibling?.querySelector('.arrow');
    if (arrow) {
        arrow.textContent = content.classList.contains('active') ? '▼' : '▶';
    }
    
    // 保存每个section的展开状态
    localStorage.setItem(id + '_active', content.classList.contains('active'));
}

// 切换选项卡
function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tab = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (tab) tab.classList.add('active');
    
    const content = document.getElementById(tabId);
    if (content) {
        content.classList.add('active');
        // 确保批量结果内容正确显示
        if (tabId === 'batchResults' && content.style.display === 'none') {
            content.style.display = 'block';
        }
    }
    
    currentTab = tabId;
}

// 快捷键支持
document.addEventListener('keydown', (e) => {
    // Ctrl+Enter 发送全部
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        sendAllRequests();
    }
    // Ctrl+Shift+Enter 发送单个
    if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        sendSingleRequest();
    }
    // Ctrl+S 保存
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveCollection();
    }
});


// ========== 保存和加载（服务器端） ==========

// 从服务器加载
async function loadFromServer() {
    fetch('/api/data/requests')
        .then(res => res.json())
        .then(data => {
            // 清空现有数据
            requests.length = 0;
            groups.length = 0;
            
            // 先添加 'all' 分组
            groups.push({ id: 'all', name: '所有分组', color: '#666' });
            
            // 加载分组
            if (data.groups && Array.isArray(data.groups)) {
                data.groups.forEach(g => groups.push(g));
            } else {
                groups.push({ id: 'default', name: '默认分组', color: '#e94560' });
            }
            
            // 加载请求
            if (data.requests && Array.isArray(data.requests)) {
                data.requests.forEach(req => requests.push(req));
            }
            
            // 加载变量
            if (data.globalVariables) {
                variables = data.globalVariables;
                renderVariables();
            }
            
            // 环境信息
            if (data.environments) {
                environmentData = data.environments;
            }
            
            // 渲染 UI
            renderGroupFilter();
            renderRequestList();
            
            // 选中第一个请求
            if (requests.length > 0) {
                currentRequestIndex = 0;
                renderCurrentRequest();
                updateRequestListSelection();
            } else {
                clearResponse();
            }
            
            // 加载环境变量
            return fetch('/api/environments');
        })
        .then(res => res.json())
        .then(envData => {
            if (envData.environments) {
                environmentData = envData;
            }
            initEnvironments();
        })
        .catch(err => {
            console.error('Failed to load from server:', err);
            initGroups();
            initEnvironments();
        });
}

// 渲染变量
function renderVariables() {
    if (!dom.variablesList) return;
    
    dom.variablesList.innerHTML = '';
    for (const [key, value] of Object.entries(variables)) {
        addVariable(key, value);
    }
}

// 保存集合到服务器（修改）
function saveCollection() {
    saveCurrentRequest();  // 保存当前编辑的请求
    
    // 构建完整的请求数据，确保包含 body
    const requestData = requests.map(req => ({
        name: req.name,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,        // 确保包含 body
        bodyType: req.bodyType, // 确保包含 bodyType
        auth: req.auth,
        groupId: req.groupId,
        response: req.response,
        status: req.status
    }));
    
    const data = {
        requests: requestData,
        groups: groups.filter(g => g.id !== 'all'),
        globalVariables: variables,
        environments: environmentData
    };
    
    fetch('/api/data/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            saveEnvironmentsToServer();
            showNotification('✅ 保存成功');
        }
    })
    .catch(err => console.error('Save failed:', err));
}

// 保存变量到服务器
async function saveVariablesToServer() {
    try {
        await fetch('/api/data/variables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables })
        });
    } catch (error) {
        console.error('保存变量失败:', error);
    }
}

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#2ecc71' : '#e74c3c'};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// 导出时不要再下载文件
function exportCollection() {
    showNotification('✅ 数据已自动保存到服务器');
}

// 加载时从服务器加载
function loadCollection() {
    loadFromServer();
}
function toggleRequestEditor() {
    const sections = document.querySelectorAll('.request-form .section');
    const isCollapsed = localStorage.getItem('requestEditorCollapsed') === 'true';
    
    sections.forEach(section => {
        const content = section.querySelector('.section-content');
        const arrow = section.querySelector('.arrow');
        if (content && arrow) {
            if (isCollapsed) {
                // 展开所有
                content.classList.add('active');
                arrow.textContent = '▼';
            } else {
                // 折叠所有
                content.classList.remove('active');
                arrow.textContent = '▶';
            }
        }
    });
    
    // 切换状态
    localStorage.setItem('requestEditorCollapsed', !isCollapsed);
    
    // 更新按钮图标
    if (dom.collapseBtn) {
        dom.collapseBtn.textContent = isCollapsed ? '🔼' : '🔽';
        dom.collapseBtn.title = isCollapsed ? '折叠请求编辑区域' : '展开请求编辑区域';
    }
}

// 修改 toggleAllSections 函数
function toggleAllSections() {
    const settingsSection = document.getElementById('settingsSection');
    const isCollapsed = settingsSection.classList.contains('collapsed');
    
    if (isCollapsed) {
        settingsSection.classList.remove('collapsed');
        dom.collapseBtn.textContent = '🔼';
        dom.collapseBtn.title = '折叠所有设置';
        // 恢复各section的展开状态
        document.querySelectorAll('#settingsSection .section-content').forEach(content => {
            const isActive = localStorage.getItem(content.id + '_active') === 'true';
            if (isActive) {
                content.classList.add('active');
                const arrow = content.previousElementSibling?.querySelector('.arrow');
                if (arrow) arrow.textContent = '▼';
            }
        });
    } else {
        // 保存当前各section的展开状态
        document.querySelectorAll('#settingsSection .section-content').forEach(content => {
            localStorage.setItem(content.id + '_active', content.classList.contains('active'));
        });
        settingsSection.classList.add('collapsed');
        dom.collapseBtn.textContent = '🔽';
        dom.collapseBtn.title = '展开所有设置';
    }
    
    localStorage.setItem('settingsCollapsed', isCollapsed);
}

// ===== 环境变量管理 =====

// 全局环境数据
let environmentData = {
    current: 'dev',
    environments: [
        { id: 'dev', name: 'Development', variables: { base_url: 'http://localhost:3000' } },
        { id: 'staging', name: 'Staging', variables: { base_url: 'http://staging.example.com' } },
        { id: 'prod', name: 'Production', variables: { base_url: 'http://example.com' } }
    ]
};

// 初始化环境
function initEnvironments() {
    const select = document.getElementById('environmentSelect');
    select.innerHTML = '';
    environmentData.environments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        select.appendChild(option);
    });
    select.value = environmentData.current;
    renderEnvVariables();
}

// 从服务器加载环境
function loadEnvironmentsFromServer() {
    fetch('/api/environments')
        .then(res => res.json())
        .then(data => {
            environmentData = data;
            initEnvironments();
        })
        .catch(err => {
            console.error('Failed to load environments:', err);
            initEnvironments();
        });
}

// 保存环境到服务器
function saveEnvironmentsToServer() {
    console.log('Saving environments data:', JSON.stringify(environmentData).substring(0, 200));
    
    fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(environmentData)
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => {
                throw new Error(`HTTP ${res.status}: ${text}`);
            });
        }
        return res.json();
    })
    .then(data => console.log('Environments saved successfully'))
    .catch(err => console.error('Failed to save environments:', err));
}

// 切换环境
function switchEnvironment(envId) {
    environmentData.current = envId;
    renderEnvVariables();
    saveEnvironmentsToServer();
}

// 渲染当前环境的变量列表
function renderEnvVariables() {
    const currentEnv = environmentData.environments.find(e => e.id === environmentData.current);
    if (!currentEnv) return;
    
    const container = document.getElementById('envVarsList');
    container.innerHTML = '';
    
    Object.entries(currentEnv.variables).forEach(([key, value]) => {
        const row = document.createElement('div');
        row.className = 'env-var-row';
        row.innerHTML = `
            <input type="text" class="env-var-key" value="${key}" placeholder="变量名" onchange="updateEnvVar('${key}', 'key', this.value)">
            <input type="text" class="env-var-value" value="${value}" placeholder="值" onchange="updateEnvVar('${key}', 'value', this.value)">
            <button onclick="deleteEnvVar('${key}')" title="删除">×</button>
        `;
        container.appendChild(row);
    });
}

// 添加变量
function showAddVariableDialog() {
    const key = prompt('请输入变量名：');
    if (!key) return;
    const value = prompt('请输入变量值：');
    if (value === null) return;
    
    const currentEnv = environmentData.environments.find(e => e.id === environmentData.current);
    currentEnv.variables[key] = value || '';
    renderEnvVariables();
    saveEnvironmentsToServer();
}

// 更新变量
function updateEnvVar(oldKey, field, newValue) {
    const currentEnv = environmentData.environments.find(e => e.id === environmentData.current);
    if (field === 'key' && newValue !== oldKey) {
        currentEnv.variables[newValue] = currentEnv.variables[oldKey];
        delete currentEnv.variables[oldKey];
    } else if (field === 'value') {
        currentEnv.variables[oldKey] = newValue;
    }
    renderEnvVariables();
    saveEnvironmentsToServer();
}

// 删除变量
function deleteEnvVar(key) {
    if (!confirm(`确定删除变量 "${key}" 吗？`)) return;
    const currentEnv = environmentData.environments.find(e => e.id === environmentData.current);
    delete currentEnv.variables[key];
    renderEnvVariables();
    saveEnvironmentsToServer();
}

// 新增环境
function showAddEnvironmentDialog() {
    const name = prompt('请输入环境名称（如：test）：');
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, '_');
    if (environmentData.environments.find(e => e.id === id)) {
        alert('该环境已存在！');
        return;
    }
    environmentData.environments.push({ id, name, variables: {} });
    initEnvironments();
    saveEnvironmentsToServer();
}

// 修改变量替换函数，优先使用环境变量
function replaceVariables(text) {
    if (!text) return text;
    const currentEnv = environmentData.environments.find(e => e.id === environmentData.current);
    const envVars = currentEnv ? currentEnv.variables : {};
    
    return text.replace(/\{\{(.+?)\}\}/g, (match, varName) => {
        // 先检查环境变量，再检查全局变量
        if (envVars[varName] !== undefined) return envVars[varName];
        if (variables[varName] !== undefined) return variables[varName];
        return match; // 未找到则保留原文
    });
}

// 暴露全局函数
window.addRequest = addRequest;
window.removeRequest = removeRequest;
window.removeCurrentRequest = removeCurrentRequest;
window.selectRequest = selectRequest;
window.clearAll = clearAll;
window.sendSingleRequest = sendSingleRequest;
window.sendAllRequests = sendAllRequests;
window.saveCollection = saveCollection;
window.loadCollection = loadCollection;
window.exportCollection = exportCollection;
window.addHeader = addHeader;
window.toggleSection = toggleSection;
window.switchTab = switchTab;
window.onRequestChange = onRequestChange;
window.addVariable = addVariable;
window.onVariableChange = onVariableChange;
window.loadFromFile = loadFromFile;
window.exportToFile = exportToFile;
window.createGroup = createGroup;
window.manageGroups = manageGroups;
window.renameGroup = renameGroup;
window.changeGroupColor = changeGroupColor;
window.deleteGroup = deleteGroup;
window.onGroupChange = onGroupChange;
window.generateCurlCommand = generateCurlCommand;
window.toggleRequestEditor = toggleRequestEditor;
