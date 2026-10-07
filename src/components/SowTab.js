/* The Scope of Work tab: the main and sub scope items, their order, and the clear-all and delete actions.

   Moved out of App.js unchanged. Invoked as SowTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function SowTab(ctx) {
  const {
    clearAllSow,
    deleteSowTask,
    setSowItems,
    sowItems
  } = ctx;
  return React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, "Scope of Work"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginTop: 2
    }
  }, "Main scope items are numbered (1,2,3...), sub-scope items are lettered (a,b,c...).")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setSowItems(p => [...p, {
      id: uid(),
      type: 'main',
      text: ''
    }])
  }, "+ Main Item"), /*#__PURE__*/React.createElement("button", {
    style: btn('info', true),
    onClick: () => setSowItems(p => [...p, {
      id: uid(),
      type: 'sub',
      text: ''
    }])
  }, "+ Sub Item"), sowItems.length > 0 && /*#__PURE__*/React.createElement("button", {
    style: btn('danger', true),
    onClick: clearAllSow
  }, "Clear All"))), sowItems.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '28px 0',
      color: MT,
      fontSize: 12,
      border: `1px dashed ${BDR}`,
      borderRadius: 6
    }
  }, "No items yet. Click \"+ Main Item\" to start adding scope steps."), sowItems.length > 0 && /*#__PURE__*/React.createElement("div", null, (() => {
    let mainCount = 0,
      subCount = 0,
      lastType = null;
    return sowItems.map((item, idx) => {
      if (item.type === 'main') {
        mainCount++;
        subCount = 0;
      } else {
        subCount++;
      }
      const label = item.type === 'main' ? String(mainCount) + '.' : String.fromCharCode(96 + subCount) + '.';
      const isMain = item.type === 'main';
      return /*#__PURE__*/React.createElement("div", {
        key: item.id,
        style: {
          display: 'flex',
          gap: 8,
          marginBottom: 8,
          alignItems: 'flex-start',
          paddingLeft: isMain ? 0 : 24
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          color: isMain ? TX : MT,
          fontWeight: isMain ? 700 : 400,
          fontSize: isMain ? 13 : 12,
          minWidth: 28,
          paddingTop: 7,
          flexShrink: 0,
          textAlign: 'right'
        }
      }, label), /*#__PURE__*/React.createElement("textarea", {
        style: {
          ...INP,
          flex: 1,
          height: isMain ? 44 : 38,
          resize: 'vertical',
          fontSize: isMain ? 13 : 12,
          fontWeight: isMain ? 600 : 400,
          background: isMain ? SURF : alpha(BG, '88'),
          borderColor: isMain ? alpha(BDR, '88') : alpha(BDR, '44')
        },
        value: item.text,
        onChange: e => setSowItems(p => p.map(s => s.id === item.id ? {
          ...s,
          text: e.target.value
        } : s)),
        placeholder: isMain ? 'Main scope step...' : 'Sub-step detail...'
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("button", {
        title: "Move up",
        disabled: idx === 0,
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
          return a;
        })
      }, "^"), /*#__PURE__*/React.createElement("button", {
        title: "Move down",
        disabled: idx === sowItems.length - 1,
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
          return a;
        })
      }, "v"),
      /* A main step could only ever be APPENDED. Remembering a step you left
         out of the middle of a method meant adding it at the end and clicking
         Move up until it arrived -- once per position. Both kinds insert where
         you are now; the buttons at the top still add at the end. */
      /*#__PURE__*/React.createElement("button", {
        title: "Insert a main item below this one",
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          a.splice(idx + 1, 0, {
            id: uid(),
            type: 'main',
            text: ''
          });
          return a;
        })
      }, "+1"), item.type === 'main' && /*#__PURE__*/React.createElement("button", {
        title: "Insert a sub-item below this one",
        style: btn('info', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          a.splice(idx + 1, 0, {
            id: uid(),
            type: 'sub',
            text: ''
          });
          return a;
        })
      }, "+a"), /*#__PURE__*/React.createElement("button", {
        title: "Delete",
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 4px'
        },
        onClick: () => deleteSowTask(item)
      }, "x")));
    });
  })())));
}
