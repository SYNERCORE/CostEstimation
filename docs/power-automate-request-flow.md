# Power Automate: request notifications (new, returned, resubmitted, accepted, declined)

This is a **second flow**, built the same way as **CE approval — Teams**. The app never sends a message. At each
request event it writes plain columns on the request's row in **SHICCE_Monitoring**, and the flow does the rest.

## What the app writes (build 361 onward)

On the request's Monitoring row, at each event:

| Column | Holds |
|---|---|
| `shicReqState` | `new`, `returned`, `resubmitted`, `accepted` or `declined` |
| `shicReqTo` | who to tell: display names, comma separated (`Ana Cruz, Ben Reyes`). **Empty on `new`/`resubmitted` when no estimator is assigned** – the flow then tells the people ticked as reviewers |
| `shicReqKey` | `state|timestamp` – new at every event; this is what stops a message on every save |
| `shicReqNote` | the reviewer's note, decline reason, or `customer - project title` for a new request (max 240 characters) |
| `shicReqBy` | who did it |
| `shicReqRce` | the RCE No. |
| `shicReqNotified` | **the flow's own memory. The app never writes it.** |

Who is told:

| Event | Told |
|---|---|
| `new` | the assigned estimators; if none, the three reviewers |
| `returned` | the requestor |
| `declined` | the requestor |
| `resubmitted` | the assigned estimators; if none, the three reviewers |
| `accepted` | the requestor **and** the assigned estimators |

## Before building

1. In the app: **SP Setup → Repair lists & columns**. This creates the six `shicReq…` columns on SHICCE_Monitoring.
2. In SharePoint, open the **SHICCE_Monitoring** list and add one column yourself: **`shicReqNotified`**, *Single line of text*. The app does not create it, on purpose.
3. Until step 1 is done the app keeps saving; it just writes without the columns (the console says so).

## Build the flow

Name: **Request — Teams**. Environment: Synercore Heavy Industries. Reuse the approval flow's connections.

### 1. Trigger

**SharePoint – When an item is created or modified**, Site = the SHIC site, List = **SHICCE_Monitoring**.

Settings → **Trigger conditions**, add:

```
@and(not(empty(triggerOutputs()?['body/shicReqKey'])), not(equals(triggerOutputs()?['body/shicReqKey'], triggerOutputs()?['body/shicReqNotified'])))
```

Insert `shicReqKey` and `shicReqNotified` as **dynamic-content pills** wherever the steps below say so. A typed column name
compares the literal word and silently never matches.

### 2. Reviewers (only used when nobody is assigned)

The reviewers are kept in SharePoint, so changing them never means editing the flow.

1. On **SHICCE_Users** add a column **`shicReviewer`**, type **Yes/No**, default No. Tick it for each reviewer.
2. **SharePoint – Get items**, name it exactly `Get reviewers`. List **SHICCE_Users**, Filter Query `shicReviewer eq 1`, Top Count `10`. Directly under the trigger.

### 3. Get newest row for this request

**SharePoint – Get items**, List **SHICCE_Monitoring**. **Do not rename this action** (an expression below reads it).

- Filter Query: `shicCEId eq <pill: shicCEId from the trigger>`
- Order By: `Modified desc`
- Top Count: `1`

### 4. Condition – is this the newest row?

`first(body('Get_newest_row_for_this_request')?['value'])?['ID']`  **is equal to**  the trigger's **ID** pill.

Everything below goes in the **True** branch. The False branch stays empty (a duplicate older row, already handled by the newest one).

### 5. Compose – the recipients

**Compose**, name `Recipients`, value:

```
@if(empty(triggerOutputs()?['body/shicReqTo']), if(or(equals(triggerOutputs()?['body/shicReqState'],'new'),equals(triggerOutputs()?['body/shicReqState'],'resubmitted')), join(select(body('Get_reviewers')?['value'], item()?['shicEmail']), ','), ''), triggerOutputs()?['body/shicReqTo'])
```

Reading it: names in `shicReqTo` win; with none, `new` and `resubmitted` fall back to the reviewers' emails; any other state with no
name sends nothing.

Because the reviewers come back as emails and `shicReqTo` holds names, the next step treats an entry containing `@` as an email and anything
else as a name to look up.

### 6. Compose – the message

**Compose**, name `Message`, value (one line per state; keep the wording yours):

```
@concat(
 if(equals(triggerOutputs()?['body/shicReqState'],'new'),     concat('New request ', triggerOutputs()?['body/shicReqRce'], ' for review: ', triggerOutputs()?['body/shicReqNote']),
 if(equals(triggerOutputs()?['body/shicReqState'],'resubmitted'), concat('Request ', triggerOutputs()?['body/shicReqRce'], ' was sent back to Cost Estimation. ', triggerOutputs()?['body/shicReqNote']),
 if(equals(triggerOutputs()?['body/shicReqState'],'returned'),    concat('Request ', triggerOutputs()?['body/shicReqRce'], ' was returned to you by ', triggerOutputs()?['body/shicReqBy'], '. Please add what is missing and send it back. ', triggerOutputs()?['body/shicReqNote']),
 if(equals(triggerOutputs()?['body/shicReqState'],'declined'),    concat('Request ', triggerOutputs()?['body/shicReqRce'], ' was declined (No Quote) by ', triggerOutputs()?['body/shicReqBy'], '. Reason: ', triggerOutputs()?['body/shicReqNote']),
 concat('Request ', triggerOutputs()?['body/shicReqRce'], ' was accepted by ', triggerOutputs()?['body/shicReqBy'], ' and is ready for costing. ', triggerOutputs()?['body/shicReqNote'])
 )))), '  https://synercore.github.io/CostEstimation/')
```

### 7. Apply to each – tell each recipient

**Apply to each** over `split(outputs('Recipients'), ',')`. Inside:

1. **Condition**: `contains(trim(item()), '@')`
   - **True** (an email): **Post message in a chat or channel** – *Post as* **Flow bot**, *Post in* **Chat with Flow bot**, *Recipient* `trim(item())`, *Message* `outputs('Message')`.
   - **False** (a name): first **SharePoint – Get items** on **SHICCE_Users**, name it `Get recipient account`, Filter Query `shicName eq '<pill: Current item>'`, Top Count 1 (put `trim(item())` in the filter via an expression, not typed text). Then **Post message in a chat or channel** – Flow bot, Chat with Flow bot, *Recipient* `first(body('Get_recipient_account')?['value'])?['shicEmail']`, *Message* `outputs('Message')`.

A name that is not in SHICCE_Users has no email and the message for that person is skipped, which is why the app asks people to **pick** names from the list.

### 8. Remember what was sent

After the Apply to each, still inside the True branch: **SharePoint – Update item** on SHICCE_Monitoring, ID = the trigger's ID.

Set **only** `Title` (keep the trigger's Title pill) and `shicReqNotified` = the trigger's `shicReqKey` pill. Leave every other field and every advanced
parameter untouched. An empty-but-present advanced parameter is sent as a blank and wipes that column.

The save re-triggers the flow once; the trigger condition is false (key equals notified) so it stops. The circular-loop warning on
save is expected, as with the approval flow.

## Checks

| Do this in the app | Expect |
|---|---|
| A requestor files a request with an estimator picked | that estimator gets one message |
| A requestor files a request with nobody assigned | the three reviewers each get one message |
| A reviewer chooses **Return to requestor** | the requestor gets one message with the note |
| The requestor presses **Send back** | the estimators (or reviewers) get one message |
| A reviewer chooses **Accept** | the requestor and the estimators each get one message |
| A reviewer chooses **Decline** | the requestor gets one message with the reason |
| Edit a remark on the request | nobody gets a message |

## If it does not send

- No messages at all: check the six `shicReq…` columns exist (Repair lists & columns), and that `shicReqNotified` was added by hand.
- Messages repeat on every save: the Update item in step 8 is writing something other than `shicReqNotified`, or the trigger condition was typed instead of pasted.
- One person never receives: their display name in the app is not exactly their `shicName` in SHICCE_Users. Pick names from the list, do not type them.
- Do not rename `Get newest row for this request` or `Get recipient account`; expressions read them by name.
