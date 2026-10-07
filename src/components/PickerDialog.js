/* The Masterlist picker dialog: choose rows from the Masterlist to add to a resource tab.

   Moved out of App.js unchanged. Each maker below returns the function App used to declare in place; App calls
   makeX(() => ({ ...the names it reads... })) once per render. The names are read when the function is CALLED, not when it is made,
   so a function still sees the same values (and can reach ones declared further down App) exactly as the closure it replaces did. */

function makePicker(getCtx) {
  return () => {
    const {
      masterlist,
      picker,
      pickerQ,
      pickerSel,
      setPicker,
      setPickerQ,
      setPickerSel
    } = getCtx();
    if (!picker) return null;
    const q = pickerQ, setQ = setPickerQ;
    const sel = pickerSel, setSel = setPickerSel; /* {id: item} for multi-select */
    const items = (masterlist[picker.type] || []).filter(r => !q || (r.role || r.desc || '').toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase()));
    const selCount = Object.keys(sel).length;
    const toggleItem = item => {
      setSel(p => {
        const n = {
          ...p
        };
        if (n[item.id]) delete n[item.id];else n[item.id] = item;
        return n;
      });
    };
    const applySelected = () => {
      Object.values(sel).forEach(item => picker.onSelect(item));
      setPicker(null);
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'fixed',
        inset: 0,
        background: '#000c',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      },
      /* A click outside closes the picker only while nothing is ticked: losing a
         long selection to a stray click meant picking every item again.
         Cancel and X still close it. */
      onClick: e => { if (e.target === e.currentTarget && !Object.keys(sel).length) setPicker(null); }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: CARD,
        border: `1px solid ${BDR}`,
        borderRadius: 12,
        width: 520,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 40px #0007'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '13px 16px',
        borderBottom: `1px solid ${BDR}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        flex: 1,
        textTransform: 'capitalize'
      }
    }, "Masterlist - ", picker.type), selCount > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        background: alpha(ACC, '22'),
        color: ACC,
        borderRadius: 12,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700
      }
    }, selCount, " selected"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setPicker(null),
      style: {
        background: 'none',
        border: 'none',
        color: MT,
        cursor: 'pointer',
        fontSize: 18,
        lineHeight: 1,
        padding: '0 4px'
      }
    }, "x")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '9px 16px',
        borderBottom: `1px solid ${BDR}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        flex: 1
      },
      placeholder: "Search...",
      value: q,
      autoFocus: true,
      onChange: e => setQ(e.target.value)
    }), items.length > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        const allSelected = items.every(i => sel[i.id]);
        if (allSelected) {
          const n = {
            ...sel
          };
          items.forEach(i => delete n[i.id]);
          setSel(n);
        } else {
          const n = {
            ...sel
          };
          items.forEach(i => {
            n[i.id] = i;
          });
          setSel(n);
        }
      }
    }, items.every(i => sel[i.id]) ? 'Deselect All' : 'Select All')), /*#__PURE__*/React.createElement("div", {
      style: {
        overflowY: 'auto',
        flex: 1
      }
    }, items.map(item => {
      const name = item.role || item.desc,
        cost = item.rate || item.cost;
      const isSelected = !!sel[item.id];
      return /*#__PURE__*/React.createElement("div", {
        key: item.id,
        onClick: () => toggleItem(item),
        style: {
          padding: '10px 16px',
          cursor: 'pointer',
          borderBottom: `1px solid ${alpha(BDR, '22')}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isSelected ? alpha(ACC, '15') : 'transparent',
          borderLeft: isSelected ? `3px solid ${ACC}` : '3px solid transparent'
        },
        onMouseEnter: e => e.currentTarget.style.background = isSelected ? alpha(ACC, '22') : SURF,
        onMouseLeave: e => e.currentTarget.style.background = isSelected ? alpha(ACC, '15') : 'transparent'
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `2px solid ${isSelected ? ACC : BDR}`,
          background: isSelected ? ACC : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }, isSelected && /*#__PURE__*/React.createElement("span", {
        style: {
          color: ON_ACC,
          fontSize: 10,
          fontWeight: 900,
          lineHeight: 1
        }
      }, "\u2713")), /*#__PURE__*/React.createElement("div", null, item.code && /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          fontSize: 9,
          color: MT,
          marginBottom: 1
        }
      }, item.code), /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          fontSize: 12
        }
      }, name), /*#__PURE__*/React.createElement("div", {
        style: {
          color: MT,
          fontSize: 11
        }
      }, item.category, " - ", item.uom))), /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          color: ACC,
          fontWeight: 700
        }
      }, "P", (cost || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })));
    }), items.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 28,
        textAlign: 'center',
        color: MT
      }
    }, "No items found.")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 16px',
        borderTop: `1px solid ${BDR}`,
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
        alignItems: 'center'
      }
    }, selCount > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontSize: 11,
        color: MT
      }
    }, selCount, " item", selCount !== 1 ? 's' : '', " selected"), /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: () => setPicker(null)
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      disabled: selCount === 0,
      onClick: applySelected
    }, "Add ", selCount > 0 ? selCount + ' Item' + (selCount !== 1 ? 's' : '') : 'Selected'))));
  };
}

