import json, urllib.request, urllib.error, urllib.parse, re, sys, time
from pathlib import Path

# mcp-remote 凭据目录：默认 ~/.mcp-auth，可用 MCP_AUTH_DIR 覆盖（跨机器可移植）。
# token 文件按 *_tokens.json 通配发现，或 NOTION_MCP_TOKENS_PATH 显式指定——不硬编码具体凭据路径（2026-11-01 安全审查 L1）。
_MCP_AUTH_DIR = Path(__import__('os').environ.get('MCP_AUTH_DIR', '~/.mcp-auth')).expanduser()
TOKENS_PATH = None  # 懒解析：首次使用由 _tokens_path() 发现

def _tokens_path():
    global TOKENS_PATH
    if TOKENS_PATH is None:
        import os as _os
        p = _os.environ.get('NOTION_MCP_TOKENS_PATH')
        if p:
            TOKENS_PATH = Path(p)
        else:
            hits = sorted((_MCP_AUTH_DIR / 'mcp-remote-v1').glob('*_tokens.json'))
            if not hits:
                raise FileNotFoundError('mcp-remote token 文件未找到：设 NOTION_MCP_TOKENS_PATH 或 MCP_AUTH_DIR')
            TOKENS_PATH = hits[0]
    return TOKENS_PATH

ENDPOINT = 'https://mcp.notion.com/mcp'

TOKENS = None  # 懒加载：首次使用才读盘，import 本模块绝不崩溃

def _load_tokens():
    """首次使用时读 token 文件并缓存。"""
    global TOKENS
    if TOKENS is None:
        with open(_tokens_path()) as f:
            TOKENS = json.load(f)
    return TOKENS

TOKEN_ENDPOINT = 'https://mcp.notion.com/token'

def refresh_tokens():
    """用 refresh_token 换新 access_token 并落盘（mcp-remote 共享同一文件）。"""
    global TOKENS
    tokens = _load_tokens()
    data = urllib.parse.urlencode({
        'grant_type': 'refresh_token',
        'refresh_token': tokens['refresh_token'],
        'client_id': 'E-oHvx6ycWcojdAn',  # mcp-remote 公开 OAuth 公共客户端 ID（PKCE public client，非机密）
    }).encode()
    req = urllib.request.Request(TOKEN_ENDPOINT, data=data, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded',
                 'User-Agent': 'mcp-remote/1.0.0'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        new = json.loads(resp.read().decode())
    TOKENS = {**tokens, **new}
    import time as _t
    if 'expires_in' in new and 'expires_at' not in new:
        TOKENS['expires_at'] = int(_t.time() * 1000) + new['expires_in'] * 1000
    _tmp = Path(str(_tokens_path()) + '.tmp')
    with open(_tmp, 'w') as f:
        json.dump(TOKENS, f)
    _tmp.replace(_tokens_path())  # 原子替换，避免与 mcp-remote 并发写撕裂（2026-11-01 I2）
    return TOKENS

class MCP:
    def __init__(self):
        self.access_token = _load_tokens()['access_token']
        self.session_id = None
        self._id = 0
        self.init()

    def _post(self, payload, notify=False):
        data = json.dumps(payload).encode('utf-8')
        headers = {
            'Authorization': 'Bearer ' + self.access_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'User-Agent': 'mcp-remote/1.0.0',
        }
        if self.session_id:
            headers['Mcp-Session-Id'] = self.session_id
        req = urllib.request.Request(ENDPOINT, data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                sid = resp.headers.get('Mcp-Session-Id')
                if sid:
                    self.session_id = sid
                body = resp.read().decode('utf-8')
                ctype = resp.headers.get('Content-Type', '')
                if notify:
                    return None
                return self._parse(body, ctype)
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if e.code == 401 and _load_tokens().get('refresh_token'):
                refresh_tokens()
                req2 = urllib.request.Request(ENDPOINT, data=data, method='POST')
                req2.add_header('Authorization', 'Bearer ' + _load_tokens()['access_token'])
                req2.add_header('Content-Type', 'application/json')
                req2.add_header('Accept', 'application/json, text/event-stream')
                req2.add_header('User-Agent', 'mcp-remote/1.0.0')
                if self.session_id:
                    req2.add_header('Mcp-Session-Id', self.session_id)
                with urllib.request.urlopen(req2, timeout=120) as resp:
                    sid = resp.headers.get('Mcp-Session-Id')
                    if sid:
                        self.session_id = sid
                    return self._parse(resp.read().decode('utf-8'), resp.headers.get('Content-Type', ''))
            raise RuntimeError(f'HTTP {e.code}: {body[:500]}')

    def _parse(self, body, ctype):
        if 'text/event-stream' in ctype or body.lstrip().startswith('event:') or re.search(r'^data: ', body, re.M):
            result = None
            for line in body.splitlines():
                if line.startswith('data: '):
                    chunk = json.loads(line[6:])
                    if 'result' in chunk or 'error' in chunk:
                        result = chunk
            return result
        if not body.strip():
            return None
        return json.loads(body)

    def init(self):
        self._id += 1
        r = self._post({
            'jsonrpc': '2.0', 'id': self._id, 'method': 'initialize',
            'params': {
                'protocolVersion': '2025-03-26',
                'capabilities': {},
                'clientInfo': {'name': 'aigc-suite-skills', 'version': '1.0'},
            },
        })
        if 'error' in (r or {}):
            raise RuntimeError(f'init error: {r}')
        self._post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, notify=True)
        return r

    def call(self, name, arguments):
        self._id += 1
        r = self._post({
            'jsonrpc': '2.0', 'id': self._id, 'method': 'tools/call',
            'params': {'name': name, 'arguments': arguments},
        })
        return r

    def tools_list(self):
        self._id += 1
        return self._post({'jsonrpc': '2.0', 'id': self._id, 'method': 'tools/list', 'params': {}})

if __name__ == '__main__':
    m = MCP()
    print('session:', m.session_id)
    r = m.tools_list()
    tools = r['result']['tools']
    print('tools:', len(tools))
    for t in tools:
        if 'page' in t['name'] or 'data-source' in t['name'] or 'fetch' in t['name']:
            print('-', t['name'])
