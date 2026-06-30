function UpdatePublisher({
  addLog
}) {
  const [upd, setUpd] = React.useState({
    version: '',
    notes: '',
    downloadUrl: '',
    urgent: false
  });
  const [updCfg, setUpdCfg] = React.useState(() => getUpdateCfg());
  const [saved, setSaved] = React.useState(false);
  const publish = async () => {
    if (!upd.version.trim()) return;
    const payload = {
      version: upd.version.trim(),
      notes: upd.notes,
      downloadUrl: upd.downloadUrl,
      urgent: upd.urgent,
      publishedAt: new Date().toISOString()
    };
    showToast('Update push via Firebase removed. Distribute the new index.html directly.', true);
  };
  const clearNotice = async () => {
    showToast('Update notice cleared.');
    addLog && addLog('Notice cleared.');
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 10
    }
  }, "Push an update notice to all connected team members. They will see a banner with a download link."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "New Version"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: upd.version,
    onChange: e => setUpd(p => ({
      ...p,
      version: e.target.value
    })),
    placeholder: "e.g. 1.1.0"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Download URL ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontWeight: 400
    }
  }, "(link to new .html)")), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: upd.downloadUrl,
    onChange: e => setUpd(p => ({
      ...p,
      downloadUrl: e.target.value
    })),
    placeholder: "https://..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1/-1'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Release Notes"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: upd.notes,
    onChange: e => setUpd(p => ({
      ...p,
      notes: e.target.value
    })),
    placeholder: "What changed in this version..."
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: upd.urgent,
    onChange: e => setUpd(p => ({
      ...p,
      urgent: e.target.checked
    })),
    style: {
      accentColor: ERR
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ERR,
      fontWeight: 700
    }
  }, "Mark as critical (shows red banner)")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: clearNotice
  }, "Clear Notice"), /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    disabled: !upd.version.trim(),
    onClick: publish
  }, "\uD83D\uDCE2 Push to Team"))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 11,
      marginBottom: 6,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }
  }, "Auto-Check URL ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      textTransform: 'none',
      fontSize: 10
    }
  }, "\u2014 optional, for self-hosted version checks")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      flex: 1,
      fontSize: 11
    },
    value: updCfg.url || '',
    onChange: e => setUpdCfg(p => ({
      ...p,
      url: e.target.value
    })),
    placeholder: "https://raw.githubusercontent.com/.../version.json"
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: updCfg.enabled || false,
    onChange: e => setUpdCfg(p => ({
      ...p,
      enabled: e.target.checked
    })),
    style: {
      accentColor: ACC
    }
  }), "Enabled"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('acc', true),
      fontSize: 11
    },
    onClick: () => {
      saveUpdateCfg(updCfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, saved ? 'Saved!' : 'Save')), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginTop: 4
    }
  }, "URL must return: ", /*#__PURE__*/React.createElement("code", {
    style: {
      color: INFO,
      background: SURF,
      padding: '1px 4px',
      borderRadius: 3
    }
  }, "{", "\"version\":\"1.1.0\",\"notes\":\"...\",\"downloadUrl\":\"...\"", "}"))));
}
