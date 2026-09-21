import urllib.request
import json
url = 'http://127.0.0.1:3003/api/query'
data = json.dumps({"paper_id": "test", "question": "author of paper", "mode": "dynamic"}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as f:
        res = json.loads(f.read().decode('utf-8'))
        print(res.get('answer'))
except Exception as e:
    print(e)
