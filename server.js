const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dns = require('dns');
const net = require('net');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 开发模式下的静态文件缓存控制
const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
    // 禁用静态文件缓存
    app.use((req, res, next) => {
        if (req.path.match(/\.(js|css|html)$/)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
        next();
    });
}

app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const VARIABLES_FILE = path.join(DATA_DIR, 'variables.json');
const AUTO_SAVE_FILE = path.join(DATA_DIR, 'autosave.json');
const ENVIRONMENTS_FILE = path.join(DATA_DIR, 'environments.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');  // 添加这一行
const HISTORY_DIR = path.join(__dirname, 'history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');  // 添加这一行

// 文件缓存（提高性能）
const fileCache = new Map();
const CACHE_TTL = isDev ? 0 : 5000; // 开发模式不缓存，生产模式缓存5秒

// 读取数据（带缓存）
async function readData(filePath) {
    try {
        const cacheKey = filePath;
        const cached = fileCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        
        if (CACHE_TTL > 0) {
            fileCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        }
        
        return parsed;
    } catch {
        return [];
    }
}

// 写入数据（同时更新缓存）
async function writeData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    fileCache.clear(); // 清空缓存
}

// 初始化数据
async function initDataFiles() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(path.join(__dirname, 'history'), { recursive: true });

        // 初始化 groups.json
        try {
            await fs.access(GROUPS_FILE);
        } catch {
            await fs.writeFile(GROUPS_FILE, JSON.stringify([
                { id: 'default', name: '默认分组', color: '#e94560', createdAt: new Date().toISOString() }
            ], null, 2));
        }

        // 初始化 requests.json
        try {
            await fs.access(REQUESTS_FILE);
        } catch {
            await fs.writeFile(REQUESTS_FILE, JSON.stringify([], null, 2));
        }
        
        console.log('数据文件初始化完成');
    } catch (error) {
        console.error('初始化数据文件失败:', error);
    }
}

app.post('/api/debug/dns', async (req, res) => {
    const { hostname } = req.body;
    if (!hostname) return res.status(400).json({ error: 'hostname is required' });
    
    try {
        const addresses = await new Promise((resolve, reject) => {
            dns.resolve4(hostname, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses);
            });
        });
        
        res.json({
            hostname,
            addresses,
            resolved: true
        });
    } catch (error) {
        res.json({
            hostname,
            error: error.message,
            resolved: false
        });
    }
});

// 端口连通性测试端点
app.post('/api/debug/ping', async (req, res) => {
    const { host, port = 80, timeout = 5000 } = req.body;
    if (!host) return res.status(400).json({ error: 'host is required' });
    
    try {
        await new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(timeout);
            
            socket.on('connect', () => {
                socket.destroy();
                resolve();
            });
            
            socket.on('error', (err) => {
                socket.destroy();
                reject(err);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
            
            socket.connect(port, host);
        });
        
        res.json({ host, port, reachable: true });
    } catch (error) {
        res.json({ host, port, reachable: false, error: error.message });
    }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        mode: isDev ? 'development' : 'production'
    });
});

// ========== 分组管理 API ==========

// 获取所有分组
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await readData(GROUPS_FILE);
        const requests = await readData(REQUESTS_FILE);
        
        const groupsWithCount = groups.map(group => ({
            ...group,
            requestCount: requests.filter(r => r.groupId === group.id).length
        }));
        
        res.json(groupsWithCount);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 创建分组
app.post('/api/groups', async (req, res) => {
    try {
        const { name, color = '#e94560' } = req.body;
        if (!name) {
            return res.status(400).json({ error: '分组名称不能为空' });
        }

        const groups = await readData(GROUPS_FILE);
        const newGroup = {
            id: uuidv4(),
            name,
            color,
            createdAt: new Date().toISOString()
        };
        
        groups.push(newGroup);
        await writeData(GROUPS_FILE, groups);
        res.json(newGroup);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 更新分组
app.put('/api/groups/:id', async (req, res) => {
    try {
        const { name, color } = req.body;
        const groups = await readData(GROUPS_FILE);
        const index = groups.findIndex(g => g.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: '分组不存在' });
        }

        if (name) groups[index].name = name;
        if (color) groups[index].color = color;
        
        await writeData(GROUPS_FILE, groups);
        res.json(groups[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除分组
app.delete('/api/groups/:id', async (req, res) => {
    try {
        let groups = await readData(GROUPS_FILE);
        const groupId = req.params.id;

        if (groupId === 'default') {
            return res.status(400).json({ error: '不能删除默认分组' });
        }

        groups = groups.filter(g => g.id !== groupId);
        
        const requests = await readData(REQUESTS_FILE);
        const updatedRequests = requests.map(r => {
            if (r.groupId === groupId) {
                return { ...r, groupId: 'default' };
            }
            return r;
        });
        
        await writeData(GROUPS_FILE, groups);
        await writeData(REQUESTS_FILE, updatedRequests);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 请求管理 API ==========

// 获取所有保存的请求
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await readData(REQUESTS_FILE);
        const { groupId, search } = req.query;
        
        let filtered = requests;
        if (groupId) {
            filtered = filtered.filter(r => r.groupId === groupId);
        }
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(r => 
                r.name.toLowerCase().includes(searchLower) ||
                r.url.toLowerCase().includes(searchLower)
            );
        }
        
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 保存请求
app.post('/api/requests', async (req, res) => {
    try {
        const { name, method, url, headers, body, bodyType, auth, groupId = 'default', description = '' } = req.body;
        
        if (!name || !url) {
            return res.status(400).json({ error: '名称和URL不能为空' });
        }

        const requests = await readData(REQUESTS_FILE);
        
        // 检查是否已存在同名请求
        const existingIndex = requests.findIndex(r => r.name === name && r.groupId === groupId);
        
        let savedRequest;
        if (existingIndex !== -1) {
            // 更新现有请求
            requests[existingIndex] = {
                ...requests[existingIndex],
                method: method || requests[existingIndex].method,
                url,
                headers: headers || {},
                body: body || null,
                bodyType: bodyType || 'none',
                auth: auth || null,
                updatedAt: new Date().toISOString()
            };
            savedRequest = requests[existingIndex];
        } else {
            // 创建新请求
            savedRequest = {
                id: uuidv4(),
                name,
                method: method || 'GET',
                url,
                headers: headers || {},
                body: body || null,
                bodyType: bodyType || 'none',
                auth: auth || null,
                groupId,
                description,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            requests.push(savedRequest);
        }
        
        await writeData(REQUESTS_FILE, requests);
        res.json(savedRequest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 更新请求
app.put('/api/requests/:id', async (req, res) => {
    try {
        const requests = await readData(REQUESTS_FILE);
        const index = requests.findIndex(r => r.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: '请求不存在' });
        }

        const { name, method, url, headers, body, bodyType, auth, groupId, description } = req.body;
        
        if (name) requests[index].name = name;
        if (method) requests[index].method = method;
        if (url) requests[index].url = url;
        if (headers) requests[index].headers = headers;
        if (body !== undefined) requests[index].body = body;
        if (bodyType) requests[index].bodyType = bodyType;
        if (auth !== undefined) requests[index].auth = auth;
        if (groupId) requests[index].groupId = groupId;
        if (description !== undefined) requests[index].description = description;
        
        requests[index].updatedAt = new Date().toISOString();
        
        await writeData(REQUESTS_FILE, requests);
        res.json(requests[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除请求
app.delete('/api/requests/:id', async (req, res) => {
    try {
        let requests = await readData(REQUESTS_FILE);
        requests = requests.filter(r => r.id !== req.params.id);
        await writeData(REQUESTS_FILE, requests);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 批量删除请求
app.post('/api/requests/batch-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        let requests = await readData(REQUESTS_FILE);
        requests = requests.filter(r => !ids.includes(r.id));
        await writeData(REQUESTS_FILE, requests);
        res.json({ success: true, deleted: ids.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 导入请求
app.post('/api/requests/import', async (req, res) => {
    try {
        const { requests: importedRequests, groupId = 'default' } = req.body;
        if (!importedRequests || !Array.isArray(importedRequests)) {
            return res.status(400).json({ error: '无效的导入数据' });
        }

        const requests = await readData(REQUESTS_FILE);
        const newRequests = importedRequests.map(r => ({
            ...r,
            id: uuidv4(),
            groupId: r.groupId || groupId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));

        requests.push(...newRequests);
        await writeData(REQUESTS_FILE, requests);
        res.json({ success: true, imported: newRequests.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 导出请求
app.post('/api/requests/export', async (req, res) => {
    try {
        const { ids, groupId } = req.body;
        let requests = await readData(REQUESTS_FILE);
        
        if (ids) {
            requests = requests.filter(r => ids.includes(r.id));
        } else if (groupId) {
            requests = requests.filter(r => r.groupId === groupId);
        }
        
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 历史记录 API ==========

app.post('/api/proxy', async (req, res) => {
    try {
        const {
            method = 'GET',
            url,
            headers = {},
            body = null,
            auth = null
        } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`[代理请求] ${method} ${url}`);
        console.log(`[容器网络] hostname: ${require('os').hostname()}`);

        const startTime = Date.now();
        
        const config = {
            method: method.toLowerCase(),
            url: url,
            headers: headers,
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'json',
            maxRedirects: 5,
            family: 4,
            // 如果目标服务器是 HTTPS 但有证书问题
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        };

        if (auth) {
            if (auth.type === 'basic') {
                config.auth = {
                    username: auth.username,
                    password: auth.password
                };
            } else if (auth.type === 'bearer') {
                config.headers['Authorization'] = `Bearer ${auth.token}`;
            } else if (auth.type === 'apiKey') {
                config.headers[auth.keyName] = auth.keyValue;
            }
        }

        if (body && method !== 'GET') {
            config.data = body;
        }

        console.log(`[发送请求] 配置:`, JSON.stringify({
            method: config.method,
            url: config.url,
            timeout: config.timeout
        }));
        const response = await axios(config);
        const endTime = Date.now();
        console.log(`[响应] 状态: ${response.status}, 耗时: ${endTime - startTime}ms`);

        const result = {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
            time: endTime - startTime,
            size: JSON.stringify(response.data).length
        };

        // 保存历史记录
        const history = await readData(HISTORY_FILE);
        history.unshift({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            method,
            url,
            headers,
            body,
            response: result
        });
        
        if (history.length > 100) {
            history.length = 100;
        }
        await writeData(HISTORY_FILE, history);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: true,
            message: error.message,
            code: error.code,
            detail: error.response ? {
                status: error.response.status,
                headers: error.response.headers,
                data: error.response.data
            } : null
        });
    }
});

app.get('/api/history', async (req, res) => {
    const history = await readData(HISTORY_FILE);
    res.json(history);
});

app.delete('/api/history/:id', async (req, res) => {
    let history = await readData(HISTORY_FILE);
    history = history.filter(item => item.id !== req.params.id);
    await writeData(HISTORY_FILE, history);
    res.json({ success: true });
});

app.delete('/api/history', async (req, res) => {
    await writeData(HISTORY_FILE, []);
    res.json({ success: true });
});

// ========== 集合管理 API ==========

// 保存集合
app.post('/api/collections', async (req, res) => {
    try {
        const { name, requests } = req.body;
        if (!name) {
            return res.status(400).json({ error: '集合名称不能为空' });
        }

        const collectionsFile = path.join(DATA_DIR, 'collections.json');
        let collections = [];
        try {
            collections = JSON.parse(await fs.readFile(collectionsFile, 'utf8'));
        } catch {
            collections = [];
        }

        const newCollection = {
            id: uuidv4(),
            name,
            requests: requests || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        collections.push(newCollection);
        await fs.writeFile(collectionsFile, JSON.stringify(collections, null, 2));
        res.json(newCollection);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取所有集合
app.get('/api/collections', async (req, res) => {
    try {
        const collectionsFile = path.join(DATA_DIR, 'collections.json');
        let collections = [];
        try {
            collections = JSON.parse(await fs.readFile(collectionsFile, 'utf8'));
        } catch {
            collections = [];
        }
        res.json(collections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取单个集合
app.get('/api/collections/:id', async (req, res) => {
    try {
        const collectionsFile = path.join(DATA_DIR, 'collections.json');
        const collections = JSON.parse(await fs.readFile(collectionsFile, 'utf8'));
        const collection = collections.find(c => c.id === req.params.id);
        
        if (!collection) {
            return res.status(404).json({ error: '集合不存在' });
        }
        
        res.json(collection);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除集合
app.delete('/api/collections/:id', async (req, res) => {
    try {
        const collectionsFile = path.join(DATA_DIR, 'collections.json');
        let collections = JSON.parse(await fs.readFile(collectionsFile, 'utf8'));
        collections = collections.filter(c => c.id !== req.params.id);
        await fs.writeFile(collectionsFile, JSON.stringify(collections, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 文件系统监控（使用 Node.js 原生 API） ==========

if (isDev) {
    console.log('启动文件监控（开发模式）...');
    
    // 监控 public 目录
    const publicDir = path.join(__dirname, 'public');
    try {
        fsSync.accessSync(publicDir);
        
        // 使用 fs.watch 监控文件变化
        const watcher = fsSync.watch(publicDir, { recursive: true }, (eventType, filename) => {
            if (filename) {
                console.log(`文件变更: ${filename} (${eventType})`);
                // 清除缓存
                fileCache.clear();
            }
        });
        
        watcher.on('error', (error) => {
            console.error('文件监控错误:', error.message);
        });
        
        console.log('文件监控已启动');
    } catch (err) {
        console.log('public 目录不存在，跳过文件监控');
    }
}

// 保存全部数据（请求 + 变量）
app.post('/api/data/save', async (req, res) => {
    try {
        const data = req.body;
        
        // 保存请求和分组
        const saveData = {
            requests: data.requests || [],
            groups: data.groups || [],
            globalVariables: data.globalVariables || {}
        };
        
        // 如果包含环境数据，也保存
        if (data.environments) {
            saveData.environments = data.environments;
            await fs.writeFile(ENVIRONMENTS_FILE, JSON.stringify(data.environments, null, 2));
        }
        
        await fs.writeFile(REQUESTS_FILE, JSON.stringify(saveData, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 加载请求
app.get('/api/data/requests', async (req, res) => {
    try {
        try {
            await fs.access(REQUESTS_FILE);
        } catch {
            return res.json({ requests: [], groups: [], environments: null });
        }
        
        const content = await fs.readFile(REQUESTS_FILE, 'utf8');
        const data = JSON.parse(content);
        
        // 如果保存的数据中包含环境信息，一并返回
        res.json({
            requests: data.requests || [],
            groups: data.groups || [],
            globalVariables: data.globalVariables || {},
            environments: data.environments || null
        });
    } catch (err) {
        console.error('Error reading requests:', err);
        res.status(500).json({ error: err.message });
    }
});

// 加载变量
app.get('/api/data/variables', async (req, res) => {
    try {
        // 优先从自动保存文件加载
        try {
            const autoSave = JSON.parse(await fs.readFile(AUTO_SAVE_FILE, 'utf8'));
            if (autoSave.variables) {
                return res.json({ variables: autoSave.variables });
            }
        } catch {
            // 自动保存文件不存在，从变量文件加载
        }
        
        const data = await readData(VARIABLES_FILE);
        res.json(data.variables ? data : { variables: {} });
    } catch (error) {
        res.json({ variables: {} });
    }
});

// 保存变量
app.post('/api/data/variables', async (req, res) => {
    try {
        const { variables } = req.body;
        await writeData(VARIABLES_FILE, { variables });
        
        // 同时更新自动保存文件中的变量
        try {
            const autoSave = JSON.parse(await fs.readFile(AUTO_SAVE_FILE, 'utf8'));
            autoSave.variables = variables;
            await writeData(AUTO_SAVE_FILE, autoSave);
        } catch {
            // 自动保存文件可能不存在
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 自动保存（每次发送请求后自动调用）
app.post('/api/data/autosave', async (req, res) => {
    try {
        const data = req.body;
        
        const saveData = {
            requests: data.requests || [],
            groups: data.groups || [],
            globalVariables: data.globalVariables || {}
        };
        
        // 保存环境数据
        if (data.environments) {
            saveData.environments = data.environments;
            await fs.writeFile(ENVIRONMENTS_FILE, JSON.stringify(data.environments, null, 2));
        }
        
        await fs.writeFile(AUTO_SAVE_FILE, JSON.stringify(saveData, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/data/autosave', async (req, res) => {
    try {
        try {
            await fs.access(AUTO_SAVE_FILE);
        } catch {
            return res.json({ requests: [], groups: [], environments: null });
        }
        
        const content = await fs.readFile(AUTO_SAVE_FILE, 'utf8');
        const data = JSON.parse(content);
        res.json({
            requests: data.requests || [],
            groups: data.groups || [],
            globalVariables: data.globalVariables || {},
            environments: data.environments || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ========== 内置测试服务器 ==========

// 简易测试端点
app.get('/api/echo', (req, res) => {
    res.json({
        method: 'GET',
        headers: req.headers,
        query: req.query,
        body: null
    });
});

app.post('/api/echo', (req, res) => {
    res.json({
        method: 'POST',
        headers: req.headers,
        query: req.query,
        body: req.body
    });
});

app.put('/api/echo', (req, res) => {
    res.json({
        method: 'PUT',
        headers: req.headers,
        query: req.query,
        body: req.body
    });
});

app.delete('/api/echo', (req, res) => {
    res.json({
        method: 'DELETE',
        headers: req.headers,
        query: req.query,
        body: req.body
    });
});

// 延迟测试
app.get('/api/delay/:seconds', async (req, res) => {
    const seconds = parseInt(req.params.seconds) || 1;
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    res.json({ message: `Delayed ${seconds} seconds` });
});

// 状态码测试
app.get('/api/status/:code', (req, res) => {
    const code = parseInt(req.params.code) || 200;
    res.status(code).json({ status: code });
});

// 保存所有环境数据
app.get('/api/environments', async (req, res) => {
    try {
        try {
            await fs.access(ENVIRONMENTS_FILE);
        } catch {
            // 文件不存在，返回默认环境
            return res.json({
                current: 'dev',
                environments: [
                    { id: 'dev', name: 'Development', variables: {} },
                    { id: 'staging', name: 'Staging', variables: {} },
                    { id: 'prod', name: 'Production', variables: {} }
                ]
            });
        }
        
        const content = await fs.readFile(ENVIRONMENTS_FILE, 'utf8');
        const data = JSON.parse(content);
        res.json(data);
    } catch (err) {
        console.error('Error reading environments:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/environments', async (req, res) => {
    try {
        const data = req.body;
        // 验证数据结构
        if (!data.environments || !Array.isArray(data.environments)) {
            return res.status(400).json({ error: 'Invalid environment data structure' });
        }
        await fs.writeFile(ENVIRONMENTS_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 初始化数据文件
initDataFiles().then(() => {
    app.listen(PORT, () => {
        console.log(`API Tester running on http://localhost:${PORT}`);
        console.log(`运行模式: ${isDev ? '开发模式' : '生产模式'}`);
        console.log('提示: 修改 public/ 目录下的文件后刷新浏览器即可看到效果');
        if (isDev) {
            console.log('提示: 修改 server.js 后需要重启容器: docker-compose restart api-tester');
        }
    });
});

module.exports = app;