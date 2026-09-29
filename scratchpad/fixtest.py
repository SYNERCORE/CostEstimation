import io, os
p = 'tools/test-ce-requests.js'
s = io.open(p, encoding='utf8', newline='').read()
if '\r\n' in s:
    s = s.replace('\r\n', '\n')
old = [l for l in s.split('\n') if 'the attachments panel opens straight after' in l]
assert len(old) == 1, old
NL = chr(10)
lines = [
  r"ck('the attachments panel opens straight after', has(/openAttachPanel\(saved\.id\);/));",
  r"/* The documents chosen on the form go up once there is a row to hang them on,",
  r"   and that is the last thing the logging does -- see tools/test-request-docs.js. */",
  r"ck('and whatever was chosen on the form is sent, after the panel is showing',",
  r"  has(/openAttachPanel\(saved\.id\);[\s\S]{0,240}if \(_docs\.length\) await handleAttachUpload\(saved\.id, ceNum, _docs\);\n    \} catch/));",
]
s = s.replace(old[0], NL.join(lines))
tmp = p + '.tmp'
io.open(tmp, 'w', encoding='utf8', newline='').write(s)
os.replace(tmp, p)
print('ok')
