/* The notices above the header: bulk mode, the update banner, the draft banner, the drafts panel and the two toasts.

   Moved out of App.js unchanged. Invoked as AppBanners({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function AppBanners(ctx) {
  const {
    bulkOn,
    clearDraft,
    currentUser,
    deleteDraft,
    draftOwners,
    draftTidyBusy,
    draftTidyGroups,
    draftsOpen,
    draftsShown,
    drftBy,
    drftQ,
    hasDraft,
    history,
    isAdmin,
    isRequestor,
    loadDraft,
    loadSharedDrafts,
    resumeDraft,
    setBulkOn,
    setDraftsOpen,
    setDrftBy,
    setDrftQ,
    setShowDraftBanner,
    setUpdateInfo,
    sharedDrafts,
    showDraftBanner,
    showToast,
    tidyDrafts,
    toast,
    toastErr,
    undoToast,
    updateInfo
  } = ctx;
  return React.createElement(React.Fragment, null, bulkOn && isAdmin && /*#__PURE__*/React.createElement("div", {
    style: { background: alpha(ERR, '22'), borderBottom: `1px solid ${alpha(ERR, '55')}`, padding: '6px 16px',
             display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }
  },
    /*#__PURE__*/React.createElement("span", { style: { fontWeight: 700, color: ERR } }, "⚠ BULK UPLOAD MODE"),
    /*#__PURE__*/React.createElement("span", { style: { color: MT } },
      "Duplicate CE-number checking is OFF. Saving a CE number that already exists will OVERWRITE it."),
    /* A week-long window is easy to forget about, and "5d 2h left" reads like
       there is plenty of time rather than like it has been running unattended
       since Monday. Say how long it has actually been open once that passes a
       day, and say it in the same red as the warning. */
    bulkMode.isStale() && /*#__PURE__*/React.createElement("span", { style: { color: ERR, fontWeight: 700 } },
      "Open for " + bulkMode.openForText() + " — still meant to be on?"),
    /*#__PURE__*/React.createElement("span", { style: { color: MT, marginLeft: 'auto' } },
      bulkMode.timeLeftText() + " left"),
    /*#__PURE__*/React.createElement("button", {
      style: { ...btn('danger', true), fontSize: 11 },
      onClick: () => { bulkMode.disable(); setBulkOn(false); showToast('Bulk upload mode off — duplicate protection restored.'); }
    }, "Turn off now")
  ), updateInfo?.available && /*#__PURE__*/React.createElement("div", {
    style: {
      background: updateInfo.urgent ? alpha(ERR, '22') : '#22C55E22',
      borderBottom: `1px solid ${updateInfo.urgent ? ERR : OK}44`,
      padding: '8px 16px',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: updateInfo.urgent ? ERR : OK
    }
  }, updateInfo.urgent ? '\U0001f6a8 Critical' : '\U0001f195 Update', " v", updateInfo.version, " available (you have v", APP_VERSION, ")"), updateInfo.notes && /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "\u2014 ", updateInfo.notes), safeHttpUrl(updateInfo.downloadUrl) && /*#__PURE__*/React.createElement("a", {
    /* The whole banner comes from a JSON document fetched off the network, so
       downloadUrl is remote input rendered straight into an href. React does
       not block a javascript: URL there \u2014 one click would run it in the app's
       origin, with the session and every cached CE in reach. Only http(s)
       survives the check. */
    href: safeHttpUrl(updateInfo.downloadUrl),
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      ...btn('acc', true),
      fontSize: 11,
      textDecoration: 'none',
      marginLeft: 8
    }
  }, "\u2B07 Download"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      marginLeft: 'auto'
    },
    onClick: () => setUpdateInfo(null)
  }, "\u2715")), showDraftBanner && hasDraft() && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#8B5CF622',
      borderBottom: '1px solid #8B5CF644',
      padding: '7px 16px',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent-violet)',
      fontWeight: 700
    }
  }, "\u2B07 Local draft found"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT
    }
  }, "You have a local draft CE."), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      borderColor: '#8B5CF655',
      color: 'var(--accent-violet)',
      fontSize: 11
    },
    onClick: () => {
      loadDraft();
      setShowDraftBanner(false);
    }
  }, "Resume"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 11,
      marginLeft: 'auto'
    },
    onClick: () => {
      clearDraft();
      setShowDraftBanner(false);
    }
  }, "Dismiss")), draftsOpen && !isRequestor && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#000c',
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    onClick: e => e.target === e.currentTarget && setDraftsOpen(false)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${'#8B5CF644'}`,
      borderRadius: 12,
      width: 600,
      maxHeight: '78vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 40px #0008'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      borderBottom: `1px solid ${BDR}`,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--accent-violet)'
    }
  }, "\uD83D\uDCCB Resume Work"),/*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11,
      flex: 1
    }
  }, 'Unsaved work in progress, shared via SharePoint'),
  (() => {
    const g = draftTidyGroups();
    const tb = (t, title, on, n) => /*#__PURE__*/React.createElement("button", {
      style: {...btn('def', true), fontSize: 10, padding: '3px 8px', opacity: (n && !draftTidyBusy) ? 1 : .45},
      disabled: !n || draftTidyBusy, title, onClick: on
    }, t + ' (' + n + ')');
    return /*#__PURE__*/React.createElement("span", {style: {display: 'flex', gap: 6, marginRight: 6}},
      tb('\uD83E\uDDF9 CE saved', 'Clear the drafts whose CE has since been saved. What they hold that was never saved is lost.',
        () => tidyDrafts('saved'), g.savedCE.length),
      tb('\uD83E\uDDF9 Over 30 days', 'Clear the drafts nobody has touched in a month.',
        () => tidyDrafts('old'), g.old.length));
  })(),
  /*#__PURE__*/React.createElement("button", {
    onClick: () => loadSharedDrafts(),
    style: btn('def', true),
    title: "Refresh"
  }, "\u21BB"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDraftsOpen(false),
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 18,
      padding: '0 4px'
    }
  }, "x")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      flex: 1,
      padding: 12
    }
  }, sharedDrafts.length > 0 && /*#__PURE__*/React.createElement("div", {style: {display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap'}},
    /*#__PURE__*/React.createElement("input", {type: 'search', value: drftQ, placeholder: 'Search drafts: CE no., client, job, estimator\u2026', 'aria-label': 'Search Resume Work', onChange: e => setDrftQ(e.target.value), style: {...INP, flex: 1, minWidth: 180, fontSize: 12, padding: '5px 10px'}}),
    /*#__PURE__*/React.createElement("select", {value: drftBy, 'aria-label': 'Filter by estimator', onChange: e => setDrftBy(e.target.value), style: {...INP, fontSize: 12, padding: '5px 8px', maxWidth: 200}},
      /*#__PURE__*/React.createElement("option", {value: ''}, 'All estimators (' + sharedDrafts.length + ')'),
      draftOwners.map(o => /*#__PURE__*/React.createElement("option", {key: o.user, value: o.user}, (o.user === currentUser.username ? 'Me \u2014 ' : '') + o.name + ' (' + o.n + ')'))),
    (drftQ || drftBy) && /*#__PURE__*/React.createElement("button", {style: btn('def', true), onClick: () => { setDrftQ(''); setDrftBy(''); }}, 'Clear'),
    (drftQ || drftBy) && /*#__PURE__*/React.createElement("span", {style: {fontSize: 11, color: MT}}, draftsShown.length + ' of ' + sharedDrafts.length)),
  sharedDrafts.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      textAlign: 'center',
      color: MT
    }
  }, "Nothing in progress — every CE has been saved."), sharedDrafts.length > 0 && draftsShown.length === 0 && /*#__PURE__*/React.createElement("div", {style: {padding: 20, textAlign: 'center', color: MT}}, 'No draft matches' + (drftQ ? ' "' + drftQ + '"' : '') + (drftBy ? ' for that estimator' : '') + '.'), draftsShown.map(d => {
    const age = Math.round((Date.now() - new Date(d.savedAt).getTime()) / 60000);
    const ageStr = age < 60 ? age + 'm ago' : age < 1440 ? Math.round(age / 60) + 'h ago' : Math.round(age / 1440) + 'd ago';
    const isOwn = d.savedBy === currentUser.username;
    /* A draft of a CE that has since been saved, and written after that save:
       it is newer than the saved copy, so it is kept -- but say so, or nobody
       can tell it from work that was never saved at all. */
    const _savedCE = (history || []).some(h => String((h.info && h.info.ceNum) || h.ceNum || '').trim().toUpperCase() === String(d.info?.ceNum || '').trim().toUpperCase());
    return /*#__PURE__*/React.createElement("div", {
      key: d.draftId,
      style: {
        padding: '12px 14px',
        background: SURF,
        borderRadius: 8,
        marginBottom: 8,
        border: `1px solid ${BDR}`,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, d.info?.ceNum || '(No CE#)'), _savedCE && /*#__PURE__*/React.createElement("span", {
      title: "This CE is saved. The draft was written after that save, so it holds changes the saved CE does not.",
      style: {fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#F0A42922', color: ACC, whiteSpace: 'nowrap'}
    }, "newer than the saved CE"), /*#__PURE__*/React.createElement("span", {
      style: {
        background: isOwn ? '#8B5CF622' : '#F0A42922',
        color: isOwn ? 'var(--accent-violet)' : ACC,
        borderRadius: 10,
        padding: '1px 8px',
        fontSize: 10,
        fontWeight: 700
      }
    }, isOwn ? 'You' : d.savedByName), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 10,
        marginLeft: 'auto'
      }
    }, ageStr)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, d.info?.description || d.info?.client || 'No description'), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        marginTop: 3
      }
    }, ceTypeLabel(d.ceType).toUpperCase(), " \xB7 ", (d.mp || []).length, " manpower \xB7 ", (d.tools || []).length, " tools \xB7 ", (d.mats || []).length, " materials")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('acc', true),
        fontSize: 11
      },
      onClick: () => resumeDraft(d)
    }, "Resume"), (isOwn || isAdmin) && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        fontSize: 11
      },
      onClick: () => deleteDraft(d.draftId)
    }, "Delete")));
  })))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      background: CARD,
      border: `1px solid ${toastErr ? ERR : BDR}`,
      borderRadius: 8,
      padding: '9px 18px',
      /* Above every modal (they sit at 3000-9999). At 999 a message raised while a
         form was open -- "Assign the request to an estimator" -- was drawn behind
         it, and the form seemed to ignore the button. */
      zIndex: 10000,
      color: TX,
      fontSize: 13,
      boxShadow: '0 4px 24px #0009',
      pointerEvents: 'none'
    }
  }, toast), undoToast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: CARD, border: `1px solid ${BDR}`, borderRadius: 8,
      padding: '10px 18px', zIndex: 10000, color: TX, fontSize: 13,
      boxShadow: '0 4px 24px #0009', display: 'flex', alignItems: 'center', gap: 12
    }
  }, undoToast.msg, /*#__PURE__*/React.createElement("button", {
    onClick: undoToast.onUndo,
    style: { ...btn('warn', true), fontSize: 12, padding: '3px 10px' }
  }, "Undo")));
}

/* The AI provider and API key dialog.

   Moved out of App.js unchanged. Invoked as ApiKeyModal({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function ApiKeyModal(ctx) {
  const {
    apiKeyInput,
    setApiKeyInput,
    setShowApiKey,
    showApiKey,
    showToast
  } = ctx;
  return showApiKey && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#000c',
      zIndex: 400,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 12,
      padding: 22,
      maxWidth: 520,
      width: '95%',
      maxHeight: '92vh',
      overflowY: 'auto',
      boxShadow: '0 8px 40px #0009'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 4
    }
  }, "AI Provider & Key"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 12,
      marginBottom: 14,
      lineHeight: 1.6
    }
  }, "Select a provider and paste your API key.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: OK,
      fontWeight: 700
    }
  }, "Gemini, Groq and Kimi"), " have free tiers - no credit card needed."), /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Select Provider"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 6,
      marginBottom: 14
    }
  }, Object.entries(PROVIDERS).map(([id, p]) => {
    const sel = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
    const isSel = sel === id;
    return /*#__PURE__*/React.createElement("div", {
      key: id,
      onClick: () => setApiKeyInput('__p__' + id + '|'),
      style: {
        border: isSel ? `2px solid ${p.bc}` : `1px solid ${BDR}`,
        borderRadius: 7,
        padding: '7px 8px',
        cursor: 'pointer',
        background: isSel ? alpha(p.bc, '18') : SURF,
        transition: 'all .12s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1.3
      }
    }, p.label), /*#__PURE__*/React.createElement("span", {
      style: {
        background: alpha(p.bc, '33'),
        color: p.bc,
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        flexShrink: 0,
        whiteSpace: 'nowrap'
      }
    }, p.badge)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 9,
        lineHeight: 1.3
      }
    }, p.note));
  })), (() => {
    const selProv = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
    const pInfo = PROVIDERS[selProv] || PROVIDERS.gemini;
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "API Key for ", pInfo.label), /*#__PURE__*/React.createElement("input", {
      id: "newApiKey",
      style: {
        ...INP,
        ...MONO,
        fontSize: 11,
        marginBottom: 6
      },
      type: "password",
      defaultValue: getProvider() === selProv ? getApiKey() : '',
      placeholder: pInfo.ph,
      autoFocus: true
    }), selProv === 'copilot' && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        ...LBL,
        marginTop: 8
      }
    }, "Azure OpenAI Endpoint URL"), /*#__PURE__*/React.createElement("input", {
      id: "azureEndpt",
      style: {
        ...INP,
        fontSize: 11
      },
      type: "text",
      defaultValue: getAzureEndpoint(),
      placeholder: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOY"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        marginBottom: 14,
        lineHeight: 1.5
      }
    }, selProv === 'gemini' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "aistudio.google.com"), " - sign in with Google, click \"Create API key\""), selProv === 'groq' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "console.groq.com"), " - sign up free, go to API Keys"), selProv === 'kimi' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "platform.moonshot.cn"), " - register, create API key"), selProv === 'openai' && /*#__PURE__*/React.createElement("span", null, "Get key: ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "platform.openai.com"), " - comes with $5 credit"), selProv === 'copilot' && /*#__PURE__*/React.createElement("span", null, "Requires ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "Azure OpenAI Service"), " resource + deployment. Enter endpoint URL above and your Azure API key below."), selProv === 'anthropic' && /*#__PURE__*/React.createElement("span", null, "Get key: ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "console.anthropic.com"), " - pay-per-use, no monthly fee")), /*#__PURE__*/React.createElement("label", {
      style: {display:'flex', alignItems:'center', gap:7, marginBottom:14, cursor:'pointer', userSelect:'none'}
    }, /*#__PURE__*/React.createElement("span", {style:{fontSize:11, color:MT}},
      "🔒 Key is session-only — cleared automatically when the tab closes"
    )), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: () => {
        setShowApiKey(false);
        setApiKeyInput('');
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      onClick: () => {
        const selP = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
        const newKey = (document.getElementById('newApiKey')?.value || '').trim();
        if (!newKey) {
          uiAlert('Please enter an API key.');
          return;
        }
        if (selP === 'copilot') {
          const ep = (document.getElementById('azureEndpt')?.value || '').trim();
          if (!ep) {
            uiAlert('Enter your Azure OpenAI endpoint URL.');
            return;
          }
          setAzureEndpoint(ep);
        }
        setProvider(selP);
        setApiKey(newKey);
        showToast((PROVIDERS[selP]?.label || selP) + ' key saved! (session only — clears on tab close)');
        setShowApiKey(false);
        setApiKeyInput('');
      }
    }, "Save & Use"), getApiKey() && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        marginLeft: 'auto'
      },
      onClick: () => {
        sessionStorage.removeItem('sy3:apikey');
        localStorage.removeItem('sy3:apikey');
        localStorage.removeItem('sy3:rememberkey');
        localStorage.removeItem('sy3:provider');
        localStorage.removeItem('sy3:azureEndpoint');
        showToast('AI config cleared.');
        setShowApiKey(false);
      }
    }, "Clear")));
  })()));
}

/* The top bar (title, sync, save and export controls, account) and the tab bar under it.

   Moved out of App.js unchanged. Invoked as AppHeader({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function AppHeader(ctx) {
  const {
    TABS,
    TAB_GROUPS,
    _tabMemory,
    busyBtn,
    busyOp,
    ceType,
    currentUser,
    handleExport,
    handleNew,
    handleSave,
    isRequestor,
    loadSharedDrafts,
    mats,
    misc,
    mp,
    myTodo,
    onLogout,
    ppe,
    provInfo,
    setApiKeyInput,
    setCeType,
    setDraftsOpen,
    setMySigOpen,
    setShowApiKey,
    setTab,
    sharedDrafts,
    sowUnassignedCount,
    tab,
    tools
  } = ctx;
  return React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      background: CARD,
      borderBottom: `1px solid ${BDR}`,
      display: 'flex',
      alignItems: 'stretch',
      height: 'var(--h-top)',
      padding: '0 16px',
      position: 'sticky',
      top: 'var(--y-top)',
      zIndex: 50,
      /* Height is fixed (the tab strip sticks at top:48), so scroll rather than
         wrap when the buttons no longer fit. */
      overflowX: 'auto',
      overflowY: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      paddingRight: 14,
      borderRight: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: ACC,
      color: ON_ACC,
      fontWeight: 800,
      fontSize: 10,
      padding: '3px 8px',
      borderRadius: 4,
      letterSpacing: '0.05em'
    }
  }, "SHIC"), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-tight",
    style: {
      fontWeight: 700,
      fontSize: 14
    }
  }, "Cost Estimator"), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-narrow",
    style: {
      color: MT,
      fontSize: 10
    }
  }, "v3")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 10px',
      borderRight: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: ceType,
    onChange: e => setCeType(e.target.value),
    'aria-label': 'Project type',
    title: ceType ? 'Project type' : 'Required: choose the project type',
    style: {
      background: alpha((CE_CFG[ceType] || {}).color || ACC, '1A'),
      color: (CE_CFG[ceType] || {}).color || ACC,
      border: ceType ? `1px solid ${alpha((CE_CFG[ceType] || {}).color || ACC, '55')}` : `1px solid ${ERR}`,
      borderRadius: 5,
      padding: '5px 8px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: 700,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("option", { value: "", disabled: true }, "— Project type * —"), Object.keys(CE_CFG).map(ceKey => /*#__PURE__*/React.createElement("option", { key: ceKey, value: ceKey }, ceTypeLabel(ceKey))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '0 10px',
      borderRight: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement(TopRefreshButton, null), /* The three work buttons share one height, radius and weight. Save is the one filled button (the main
     action); New is outlined; Resume carries the violet of drafts. */
  /*#__PURE__*/React.createElement("button", {
    className: "tb-btn",
    style: { ...btn('def', true), padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 7, color: 'var(--text-primary)', borderColor: 'var(--border-strong)' },
    onClick: handleNew,
    title: "New CE (Ctrl+N)"
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 15, lineHeight: 1, marginTop: -1 } }, "+"), "New"), /*#__PURE__*/React.createElement("button", {
    className: "tb-btn",
    style: busyBtn('save', { ...btn('acc', true), padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 7 }),
    disabled: !!busyOp.save,
    onClick: handleSave,
    title: "Save CE (Ctrl+S)"
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 13, lineHeight: 1 } }, "\ud83d\udcbe"), busyOp.save ? "Saving\u2026" : "Save"), /* Resume Work is reachable from any tab here; it used to live only on the Summary step.
     A requestor only logs requests and has no drafts of their own, so it is not offered to them. */
  !isRequestor && /*#__PURE__*/React.createElement("button", {
    className: "tb-btn",
    style: { ...btn('def', true), position: 'relative', padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 7, color: 'var(--accent-violet)', borderColor: '#8B5CF666', background: '#8B5CF61A' },
    onClick: () => { loadSharedDrafts(); setDraftsOpen(true); },
    title: "Open the list of unsaved drafts \u2014 yours and the team's \u2014 to resume one or clear the old ones."
  }, "\ud83d\udccb Resume", sharedDrafts.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: { marginLeft: 5, background: 'var(--accent-violet)', color: '#fff', borderRadius: 9, padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: 1.2 }
  }, sharedDrafts.length)), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-narrow",
    title: "Keyboard shortcuts: Ctrl+S = Save  •  Ctrl+N = New CE",
    style: {fontSize:9, color:BDR, cursor:'default', userSelect:'none', letterSpacing:.3}
  }, "Ctrl+S / Ctrl+N"), /*#__PURE__*/React.createElement(SignInBanner, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginLeft: 'auto',
      paddingLeft: 12,
      borderLeft: `1px solid ${BDR}`
    }
  }, /* Project Analyzer and ML Insights. They floated over the bottom-right corner of every screen, on top of the last column of any list;
       they live here now, where nothing is underneath. */
  [['📁', 'Project Analyzer', 'openODPanel'], ['🧠', 'ML Insights', 'shicMLToggle']].map(([ic, lbl, fn]) => /*#__PURE__*/React.createElement("button", {
    key: fn, className: 'tb-btn tb-tool', title: lbl, 'aria-label': lbl,
    style: { ...btn('def', true), width: 30, height: 30, padding: 0, justifyContent: 'center', fontSize: 15, borderRadius: 8 },
    onClick: () => { if (typeof window[fn] === 'function') window[fn](); }
  }, ic)), /*#__PURE__*/React.createElement(OnlinePill,null), /*#__PURE__*/React.createElement(AccountMenu, {
    name: currentUser.name || currentUser.username, role: currentUser.role, flag: !(getApiKey() && provInfo)
  }, /*#__PURE__*/React.createElement(ThemeSwitch, null), /*#__PURE__*/React.createElement(ChangePasswordModal,{currentUser}), /*#__PURE__*/React.createElement("button", {style:{...btn('def',true), width:'100%', textAlign:'left'},title:"Your saved signature — used when you Approve & Sign",onClick:()=>setMySigOpen(true)}, "✍ My Signature"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      fontSize: 11, width: '100%', textAlign: 'left',
      borderColor: getApiKey() && provInfo ? alpha(provInfo.bc, '88') : alpha(ERR, '88'),
      color: getApiKey() && provInfo ? provInfo.bc : ERR
    },
    onClick: () => {
      setApiKeyInput('');
      setShowApiKey(true);
    },
    title: getApiKey() && provInfo ? provInfo.label + ' active' : 'No AI key - click to set'
  }, getApiKey() && provInfo ? 'AI: ' + provInfo.badge : 'Set AI Key'), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    style: {...btn('danger', true), width: '100%', textAlign: 'left'}
  }, "Sign Out")))), React.createElement("div", {
    className: "shic-nav",
    style: {
      background: CARD,
      borderBottom: `1px solid ${BDR}`,
      height: 'var(--h-tabs)',
      boxSizing: 'border-box',
      position: 'sticky',
      top: 'var(--y-tabs)',
      zIndex: 49
    }
  }, (() => {
    const _grp = TAB_GROUPS.find(g => g.tabs.some(t => t.id === tab)) || TAB_GROUPS[0];
    if (_grp) _tabMemory.current[_grp.id] = tab;
    return /*#__PURE__*/React.createElement("div", {
      role: "tablist", "aria-label": "Section",
      style: {display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px', height: 'var(--h-groups)', overflowX: 'auto'}
    }, TAB_GROUPS.map(g => {
      const on = _grp && g.id === _grp.id;
      /* The red count that used to sit on My Work sits on its group too, or the
         things waiting on a person would be hidden behind the Estimate heading. */
      const waiting = g.id === 'workspace' && !on ? ((myTodo.sign || []).length + (myTodo.returned || []).length) : 0;
      return /*#__PURE__*/React.createElement("button", {
        key: g.id, role: "tab", "aria-selected": on,
        onClick: () => setTab(_tabMemory.current[g.id] && g.tabs.some(t => t.id === _tabMemory.current[g.id]) ? _tabMemory.current[g.id] : g.tabs[0].id),
        style: {
          background: on ? TX : 'transparent', color: on ? CARD : MT, border: 'none', borderRadius: 6,
          padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
          whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6
        }
      }, g.label, waiting > 0 && /*#__PURE__*/React.createElement("span", {
        style: {background: ERR, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 5px', lineHeight: 1.4}
      }, waiting));
    }));
  })(), /*#__PURE__*/React.createElement("div", {
    role: "tablist", "aria-label": "Screens",
    style: {display: 'flex', padding: '0 16px', overflowX: 'auto', height: 'var(--h-subtabs)', borderTop: `1px solid ${BDR}`}
  }, ((TAB_GROUPS.find(g => g.tabs.some(t => t.id === tab)) || TAB_GROUPS[0] || {tabs: TABS}).tabs).map((t, _ti) => {
    /* Count only rows the user actually filled in. mkMP() defaults pax to 1, so
       `r.role||r.pax` counted the blank starter row and every new CE showed a
       phantom "1" on the Manpower tab. */
    const tabCounts = {manpower: mp.filter(r=>r.role).length, tools: tools.filter(r=>r.desc).length, materials: mats.filter(r=>r.desc).length, ppe: ppe.filter(r=>r.desc).length, /* Miscellaneous is the one tab that keeps its rows in per-category lists, which is why it was the one tab with no badge -- there is no flat array to count. */ misc: Object.values(misc || {}).reduce((n, arr) => n + (Array.isArray(arr) ? arr.filter(r => r && r.desc).length : 0), 0), sowbreak: sowUnassignedCount, mywork: myTodo.total};
    const cnt = tabCounts[t.id];
    const _isSteps = (TAB_GROUPS.find(g => g.tabs.some(x => x.id === tab)) || {}).steps;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      role: "tab", "aria-selected": tab === t.id,
      onClick: () => setTab(t.id),
      style: {
        background: 'none',
        border: 'none',
        borderBottom: tab === t.id ? `2px solid ${ACC}` : '2px solid transparent',
        color: tab === t.id ? ACC : MT,
        padding: _isSteps ? '9px 9px' : '9px 13px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: tab === t.id ? 700 : 400,
        fontSize: 12,
        whiteSpace: 'nowrap',
        transition: 'all .12s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, _isSteps && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {width: 17, height: 17, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 700,
        border: `1px solid ${tab === t.id ? ACC : BDR}`, background: tab === t.id ? ACC : 'transparent', color: tab === t.id ? ON_ACC : MT}
    }, _ti + 1), t.label, cnt > 0 && /*#__PURE__*/React.createElement("span", {
      title: t.id === 'mywork'
        ? [myTodo.sign.length ? myTodo.sign.length + ' waiting for your signature' : '', myTodo.returned.length ? myTodo.returned.length + ' returned to you' : ''].filter(Boolean).join(' · ')
        : t.id === 'sowbreak'
        ? cnt + ' resource row' + (cnt === 1 ? '' : 's') + ' not yet assigned to a scope task'
        : cnt + ' item' + (cnt === 1 ? '' : 's'),
      /* Work waiting on a person is red and never dimmed: it is not a row count. */
      style: {
        background: t.id === 'mywork' ? ERR : tab === t.id ? ACC : alpha(ACC, '44'),
        color: t.id === 'mywork' ? '#fff' : tab === t.id ? ON_ACC : ACC,
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 8,
        padding: '1px 5px',
        lineHeight: 1.4
      }
    }, cnt));
  }))));
}

/* The Live Totals sidebar beside the estimating tabs, with the quick rates.

   Moved out of App.js unchanged. Invoked as LiveTotalsSidebar({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function LiveTotalsSidebar(ctx) {
  const {
    TAB_GROUPS,
    cfg,
    demobSubT,
    grand,
    history,
    masterlist,
    matsT,
    miscT,
    mobSubT,
    mpTot,
    ppeT,
    provInfo,
    railSlim,
    rr,
    setApiKeyInput,
    setShowApiKey,
    setTab,
    tab,
    toggleRail,
    toolsT,
    unitP
  } = ctx;
  return (TAB_GROUPS.find(g => g.id === 'estimate') || {tabs: []}).tabs.some(t => t.id === tab) && /*#__PURE__*/React.createElement("div", {
    className: "shic-rail" + (railSlim ? " shic-rail-slim" : ""),
    style: {
      padding: '14px 14px',
      borderLeft: `1px solid ${BDR}`,
      background: CARD
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "shic-rail-keep shic-rail-toggle",
    onClick: toggleRail,
    'aria-label': railSlim ? 'Show live totals' : 'Hide live totals',
    title: railSlim ? 'Show live totals' : 'Hide live totals',
    style: {...btn('def', true), position: 'absolute', top: 8, right: 8, zIndex: 1, padding: '0 8px', lineHeight: '20px'}
  }, railSlim ? "\u2039" : "\u203a"), /*#__PURE__*/React.createElement("div", {
    className: "shic-rail-keep shic-rail-mini",
    style: {textAlign: 'center', marginTop: 30}
  }, /*#__PURE__*/React.createElement("div", {style: {fontSize: 9, color: MT, letterSpacing: '0.06em'}}, "TOTAL"),
    /*#__PURE__*/React.createElement("div", {style: {...MONO, fontSize: 10, fontWeight: 800, color: ACC, wordBreak: 'break-all'}}, "\u20b1", ph(grand))),
  /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 8
    }
  }, "Live Totals"), [...(cfg.mobDemob ? [['Mobilization', mobSubT], ['Demobilization', demobSubT]] : []), ['Manpower', mpTot], ['Tools', toolsT], ['Materials', matsT], ['PPE', ppeT], ['Misc.', miscT]].map(([lbl, val]) => /*#__PURE__*/React.createElement("div", {
    key: lbl,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, lbl), /*#__PURE__*/React.createElement("span", {
    style: {
      ...MONO,
      fontSize: 11,
      color: val > 0 ? TX : MT
    }
  }, "\u20b1", ph(val)))), /*#__PURE__*/React.createElement("div", {
    /* The grand total is the one figure the rail exists for, so it is a card
       rather than another line. The gradient is the theme's, which keeps it
       dark in both -- an amber total on a deep ground is the same reading in
       Executive Light as in Dark Slate, and DESIGN.md section 5.4 asks for
       exactly that. */
    style: {
      marginTop: 10,
      padding: '12px 14px',
      borderRadius: 10,
      background: 'var(--highlight-gradient)',
      border: `1px solid ${alpha(ACC, '44')}`,
      boxShadow: 'var(--card-shadow)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: 3
    }
  }, "Grand Total Estimate"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      /* 28px per DESIGN.md section 3, but it has to survive a nine-figure
         total in a 260px rail, so it gives way rather than overflowing. */
      fontSize: 'clamp(18px, 2.2vw, 28px)',
      lineHeight: 1.1,
      color: ACC
    }
  }, "\u20b1", ph(grand)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 10,
      color: MT,
      marginTop: 3
    }
  }, "Unit rate: \u20b1", ph(unitP))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 5,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Standard Quick Rates"),
  /* Two across, as the mockup has them: the rail is wide enough now, and a
     stacked list of five wastes most of it. The role keeps its full name --
     it was cut to the first word to fit 184px, which turned "Lead Electrical"
     and "Electrician" into the same entry. */
  /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
      gap: 6
    }
  }, masterlist.manpower.slice(0, 5).map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      border: `1px solid ${BDR}`,
      borderRadius: 6,
      padding: '5px 8px',
      minWidth: 0,
      background: 'var(--bg-surface-elevated)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    title: r.role
  }, r.role), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 12,
      fontWeight: 700,
      color: ACC
    }
  }, "₱", r.rate, /*#__PURE__*/React.createElement("span", {
    style: {fontSize: 9, color: MT, fontWeight: 400}
  }, "/day"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 9,
      marginTop: 4,
      lineHeight: 1.5
    }
  /* Read from the CE rather than written out: a fixed caption goes on
     claiming 1.25x the moment somebody edits the multiplier. */
  }, "Night ×" + ceShiftMult(rr, 'regular_night') + " · Sun ×" + ceShiftMult(rr, 'sunday_day'),
     /*#__PURE__*/React.createElement("br", null),
     "Holiday ×" + ceShiftMult(rr, 'holiday_day') + " · OT ×" + ceOtMult(rr))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "AI Provider"), getApiKey() && provInfo ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: provInfo.bc
    }
  }, provInfo.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: MT,
      marginTop: 1
    }
  }, provInfo.badge)) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: ERR
    }
  }, "Not configured"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      width: '100%',
      justifyContent: 'center',
      fontSize: 10,
      marginTop: 5
    },
    onClick: () => {
      setApiKeyInput('');
      setShowApiKey(true);
    }
  }, "Change Provider")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "History"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 14,
      fontWeight: 700,
      color: INFO
    }
  }, history.length), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginBottom: 5
    }
  }, "saved estimates"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      width: '100%',
      justifyContent: 'center',
      fontSize: 10
    },
    onClick: () => setTab('history')
  }, "View All"),
  /* Which build is actually running. Without this the only way to tell was
     reading ?v= off a stack trace in DevTools, and two bug reports were filed
     against a build that had already been fixed. */
  /*#__PURE__*/React.createElement("div", {
    style: { color: MT, fontSize: 9, textAlign: 'center', marginTop: 10, opacity: .6 },
    title: 'Build version. Reload the page if this is behind the current release.'
  }, "build ", typeof APP_BUILD === 'undefined' ? '?' : APP_BUILD)),
  /*#__PURE__*/React.createElement(FooterBar, null));
}
