"""Read-only project task discovery. No raw prompts, reasoning, or tool outputs leave this process."""
import datetime as dt
import json
from pathlib import Path
import re
import sqlite3
import sys

MAX_TAIL = 512 * 1024

def iso(value):
    return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat()

def clean(text):
    text = re.sub(r'https?://\S+', '[链接]', text)
    text = re.sub(r'(?i)(?:bearer\s+\S+|sk-[\w-]+|(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+)', '[已隐藏凭据]', text)
    return re.sub(r'\s+', ' ', text).strip()[:420]

def discover(db, roots, ids, project_ids):
    conditions, args = [], []
    for root in roots:
        conditions.append('(cwd = ? OR substr(cwd,1,?) = ?)')
        prefix = str(Path(root)) + '/'
        args.extend([str(Path(root)), len(prefix), prefix])
    for column, values in [('id', ids), ('project_id', project_ids)]:
        for value in values:
            conditions.append(column + ' = ?'); args.append(value)
    with sqlite3.connect(Path(db).resolve().as_uri() + '?mode=ro', uri=True, timeout=2) as c:
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA query_only = ON')
        # Exclude internal agents/approval runs; they are not user-created windows.
        query = "SELECT id,coalesce(nullif(name,''),title) title,cwd,rollout_path,updated_at FROM threads WHERE archived=0 AND source IN ('vscode','cli','exec') AND (" + ' OR '.join(conditions or ['0']) + ') ORDER BY updated_at DESC'
        return [dict(row) for row in c.execute(query, args)]

def scan_log(row, sessions_root, previous, now):
    path = Path(row['rollout_path']).resolve()
    if not path.is_relative_to(Path(sessions_root).resolve()):
        raise ValueError('session outside configured root')
    info = path.stat()
    old = previous or {}
    identity = f'{info.st_dev}:{info.st_ino}'
    same = old.get('identity') == identity and old.get('offset',0) <= info.st_size
    start = old.get('offset',0) if same else 0
    bounded = info.st_size - start > MAX_TAIL
    if bounded: start = info.st_size - MAX_TAIL
    result = dict(old) if same else {}
    with path.open('rb') as f:
        f.seek(start)
        if start and (bounded or not same): f.readline(); start = f.tell()
        data = f.read(MAX_TAIL)
    last = data.rfind(b'\n')
    if last >= 0:
        for line in data[:last].splitlines():
            try: event = json.loads(line)
            except (ValueError, UnicodeDecodeError): continue
            payload = event.get('payload',{})
            timestamp = event.get('timestamp')
            kind = payload.get('type')
            if event.get('type') == 'event_msg':
                if kind in ('task_started','turn_started'):
                    result.update(activity='运行中（日志）', eventAt=timestamp)
                elif kind in ('task_complete','turn_complete','task_completed','turn_completed'):
                    result.update(activity='本轮已结束', eventAt=timestamp)
                elif kind in ('turn_aborted','task_aborted'):
                    result.update(activity='本轮已中断', eventAt=timestamp)
            if event.get('type') != 'response_item': continue
            if kind in ('function_call','custom_tool_call'):
                result.update(activity='工具处理中（日志）', eventAt=timestamp)
            if kind == 'message' and payload.get('role') == 'assistant':
                content = ' '.join(x.get('text','') for x in payload.get('content',[]) if x.get('type') in ('output_text','text'))
                if content:
                    result.update(summary=clean(content), summaryAt=timestamp, eventAt=timestamp,
                                  activity='本轮已回复' if payload.get('channel') == 'final' else '正在推进（日志）')
        result['offset'] = start + last + 1
    else:
        result['offset'] = start
    result.update(identity=identity, modifiedAt=iso(info.st_mtime), truncated=bounded)
    result.setdefault('activity','暂无可识别活动')
    result.setdefault('summary','尚未取得近期进展说明')
    return result

def collect(config, previous=None, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    previous = previous or {}
    rows = discover(config['database'], config['roots'], config.get('ids',[]), config.get('projectIds',[]))
    cache, tasks = {}, []
    for row in rows[:100]:
        old = previous.get(row['id'],{})
        try:
            item = scan_log(row,config['sessionsRoot'],old,now)
            cache[row['id']] = item
            event_at = item.get('eventAt')
            age = (now-dt.datetime.fromisoformat(event_at.replace('Z','+00:00'))).total_seconds() if event_at else None
            activity = item['activity']
            if age is None or age > 300:
                activity = '近期无活动 · 运行状态待确认'
            tasks.append({k:row[k] for k in ('id','title','cwd')} | {
                'activity':activity,'summary':item['summary'],'eventAt':event_at,
                'summaryAt':item.get('summaryAt'),'logModifiedAt':item['modifiedAt'],
                'stale':False,'boundedTail':item['truncated']})
        except (OSError,ValueError):
            cache[row['id']] = old
            tasks.append({k:row[k] for k in ('id','title','cwd')} | {
                'activity':'日志暂不可读','summary':old.get('summary','无可用进展'),
                'eventAt':old.get('eventAt'),'stale':True})
    return {'tasks':tasks,'cache':cache,'totalDiscovered':len(rows),'truncated':len(rows)>100,
            'lastSuccessAt':now.isoformat(),'stale':False,'source':'本机 Codex 只读索引 + 有界会话日志'}

if __name__ == '__main__':
    try:
        request=json.load(sys.stdin)
        print(json.dumps(collect(request['config'],request.get('previous')),ensure_ascii=False))
    except (OSError,ValueError,sqlite3.Error,KeyError) as error:
        print(json.dumps({'stale':True,'error':'Codex 索引采集失败：'+type(error).__name__},ensure_ascii=False))
        sys.exit(1)
