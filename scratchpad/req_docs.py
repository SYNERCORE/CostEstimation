import io, os
p = 'src/App.js'
s = io.open(p, encoding='utf8', newline='').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

CLIP = chr(0x1F4CE)   # the paperclip, as one character -- never as a \u pair
X    = chr(0x2715)

rep("""  const [reqForm, setReqForm] = React.useState(null);
  const [reqBusy, setReqBusy] = React.useState(false);""",
"""  const [reqForm, setReqForm] = React.useState(null);
  /* The documents are chosen while the request is being written, not after it.
     They cannot go up yet -- there is no row to hang them on until the request
     is saved -- so they are held here and sent the moment there is one. */
  const [reqFiles, setReqFiles] = React.useState([]);
  const [reqBusy, setReqBusy] = React.useState(false);""")

rep("""  const openRequest = () => {
    const today = new Date().toISOString().slice(0, 10);""",
"""  const openRequest = () => {
    setReqFiles([]);
    const today = new Date().toISOString().slice(0, 10);""")

rep("""      showToast('Request ' + ceNum + ' logged and assigned to ' + fields.ceeName + '. Attach the documents that came with it.');
      openAttachPanel(saved.id);""",
"""      const _docs = reqFiles.slice();
      setReqFiles([]);
      showToast('Request ' + ceNum + ' logged and assigned to ' + fields.ceeName +
        (_docs.length ? '. Sending ' + _docs.length + ' document(s)...' : '. Attach the documents that came with it.'));
      openAttachPanel(saved.id);
      /* The request is logged either way. An upload that fails says so and
         names the file, rather than leaving the panel looking as though it
         went up. */
      if (_docs.length) await handleAttachUpload(saved.id, ceNum, _docs);""")

rep("""      for (const file of Array.from(files)) {
        const buf = await file.arrayBuffer();
        await spAddAttachment(spList('Monitoring'), spId, file.name, buf);
      }
      const updated = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(updated);
      showToast(`${files.length} file(s) uploaded.`);
    } catch(e) { showToast('Upload failed: ' + e.message, true); }""",
"""      /* One file at a time, and one failure does not end the rest: the loop
         used to stop at the first refusal -- a file too large, a name the site
         will not take -- and say "Upload failed" without saying which, while
         the files already up went unmentioned. Say what went and what did not,
         by name. */
      const gone = [], kept = [];
      for (const file of Array.from(files)) {
        try {
          const buf = await file.arrayBuffer();
          await spAddAttachment(spList('Monitoring'), spId, file.name, buf);
          gone.push(file.name);
        } catch (err) { kept.push(file.name + ' (' + String((err && err.message) || 'failed').slice(0, 60) + ')'); }
      }
      const updated = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(updated);
      if (!kept.length) showToast(gone.length + ' file(s) uploaded.');
      else showToast((gone.length ? gone.length + ' file(s) uploaded. ' : '') +
        kept.length + ' did NOT: ' + kept.join('; ') + '. Try again, or add them from the """ + CLIP + """ button.', true);
    } catch(e) { showToast('Upload failed: ' + e.message, true); }""")

rep('''      "Logs the request in CE Monitoring and assigns it. Attachments open next. The estimator Loads it, builds the estimate, and Saves under the same number."),''',
'''      "Logs the request in CE Monitoring, assigns it, and sends whatever came with it. The estimator Loads it, builds the estimate, and Saves under the same number."),''')

rep("""    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}},
      /*#__PURE__*/React.createElement("button", {style:btn('def'), disabled:reqBusy, onClick:()=>setReqForm(null)}, "Cancel"),
      /*#__PURE__*/React.createElement("button", {style:btn('acc'), disabled:reqBusy, onClick:submitRequest}, reqBusy ? "Logging…" : "Log request & attach files")
    )""",
"""    /* Chosen here, sent the moment the request has a row to hang them on. */
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}},
      L("Documents that came with it",
        /*#__PURE__*/React.createElement("div", {style:{border:'1px dashed '+BDR,borderRadius:6,padding:9}},
          /*#__PURE__*/React.createElement("input", {
            type:'file', multiple:true, disabled:reqBusy, style:{fontSize:11,color:MT,width:'100%'},
            onChange:e=>{ const picked=Array.from(e.target.files||[]); if(picked.length) setReqFiles(p=>p.concat(picked.filter(f=>!p.some(x=>x.name===f.name&&x.size===f.size)))); e.target.value=''; }
          }),
          reqFiles.length > 0 && /*#__PURE__*/React.createElement("div", {style:{marginTop:8,display:'flex',flexDirection:'column',gap:4}},
            reqFiles.map((f, i) => /*#__PURE__*/React.createElement("div", {key:f.name+i, style:{display:'flex',alignItems:'center',gap:8,fontSize:11}},
              /*#__PURE__*/React.createElement("span", {style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, '""" + CLIP + """ ' + f.name),
              /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:10,whiteSpace:'nowrap'}}, Math.max(1, Math.round(f.size/1024)).toLocaleString('en-US') + ' KB'),
              /*#__PURE__*/React.createElement("button", {
                style:{...btn('def',true),fontSize:10,padding:'1px 7px'}, disabled:reqBusy,
                title:'Take this one off the request', onClick:()=>setReqFiles(p=>p.filter((_x,k)=>k!==i))
              }, '""" + X + """')))),
          /*#__PURE__*/React.createElement("div", {style:{marginTop:6,fontSize:10,color:MT}},
            reqFiles.length
              ? reqFiles.length + ' file(s) go up as soon as the request is logged. More can be added afterwards from the """ + CLIP + """ button.'
              : 'Drawings, TOR, the RFQ, a PO -- anything the estimator needs. They can also be added afterwards from the """ + CLIP + """ button.')))),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}},
      /*#__PURE__*/React.createElement("button", {style:btn('def'), disabled:reqBusy, onClick:()=>{setReqFiles([]);setReqForm(null);}}, "Cancel"),
      /*#__PURE__*/React.createElement("button", {style:btn('acc'), disabled:reqBusy, onClick:submitRequest},
        reqBusy ? "Logging..." : (reqFiles.length ? "Log request & send " + reqFiles.length + " file(s)" : "Log request"))
    )""")

assert not [c for c in s if 0xD800 <= ord(c) <= 0xDFFF], 'a lone surrogate got in'
tmp = p + '.tmp'
io.open(tmp, 'w', encoding='utf8', newline='').write(s)
os.replace(tmp, p)
print('ok, bytes:', len(s))
