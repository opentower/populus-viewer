import { h, createRef, Fragment, Component } from 'preact';
import { UserColor } from './utils/colors.js'
import * as Icons from './icons.js'
import * as PopupMenu from './popUpMenu.js'
import * as Replies from './utils/replies.js'
import { processRegex } from './processRegex.js'
import Client from './client.js'
import ToolTip from './utils/tooltip.js'
import 'emoji-picker-element'
import * as CommonMark from 'commonmark'
import './styles/messageFrame.css'

export default class MessageFrame extends Component {
  constructor(props) {
    super(props)
    this.state = ({ 
      responding: false,
      status: props.event.getAssociatedStatus()
    })
  }

  componentDidMount() {
    if (this.props.event.getAssociatedStatus()) this.props.event.on("Event.status", this.handleStatus)
  }

  componentWillUnmount() { this.props.event.off("Event.status", this.handleStatus) }

  handleStatus = (_, status) => { this.setState({status}) }

  userColor = new UserColor(this.props.event.getSender())

  openEditor = () => this.setState({ responding: true })

  closeEditor = () => this.setState({ responding: false })

  resend = _ => Client.client.resendEvent(this.props.event)

  redactMessage = () => {
    // XXX also need to redact all subsequent edits that replace the original
    Client.client.redactEvent(this.props.event.getRoomId(), this.props.event.getId())
  }

  render(props, state) {
    // there's some cleverness involving involving the unstable clientside
    // relation aggregation mechanism that we're not taking advantage of
    // here. Element doesn't seem to use this for replacements yet either.
    const reactions = props.reactions[props.event.getId()]
      ? props.reactions[props.event.getId()]
        .filter(event => event.getContent()["m.relates_to"].rel_type === "m.annotation")
      : []
    const isUser = Client.client.getUserId() === props.event.getSender()
    return <Fragment>
      <div data-event-status={isUser ? state.status : null}
        id={props.event.getId()}
        style={props.styleOverride || this.userColor.styleVariables}
        class={isUser ? "message-frame message-from-user" : "message-frame"}>
          {props.children}
          { state.status === "not_sent"
            ? <div class="message-frame-status">
              message not sent - <a onclick={this.resend}>resend?</a>
            </div>
            : null
          }
          <MessageDecoration event={props.event} reactions={reactions}>
            {/* XXX Should probably handle action menu visibility in state rather than CSS */}
            { props.displayOnly
              ? null
              : isUser
                ? <ActionsOnOwnMessages
                    canEdit={props.canEdit}
                    responding={state.responding}
                    openEditor={this.openEditor}
                    redactMessage={this.redactMessage}
                  />
                : <ActionsOnOthersMessages
                    responding={state.responding}
                    openEditor={this.openEditor}
                    event={props.event}
                    redactMessage={this.props.canRedact ? this.redactMessage : null}
                    reactions={reactions} 
                  />
            }
          </MessageDecoration>
      </div>
      {state.responding
        ? isUser
          ? <MessageEditor closeEditor={this.closeEditor} event={props.event} />
          : <ReplyComposer closeEditor={this.closeEditor} getCurrentEdit={this.getCurrentEdit} event={props.event} />
        : null
      }
    </Fragment>
  }
}

class MessageDecoration extends Component {
  shouldComponentUpdate(nextProps) {
    return (this.props.reactions.length !== nextProps.reactions.length)
  }

  render(props) {
    const rtable = {}
    for (const reaction of props.reactions) {
      const emoji = reaction.getContent()?.["m.relates_to"]?.key
      if (!emoji) continue
      rtable[emoji]
        ? rtable[emoji] = rtable[emoji] + 1
        : rtable[emoji] = 1
    }
    const badges = []
    for (const rkey in rtable) {
      badges.push(<Badge reactions={props.reactions} event={props.event} rtable={rtable} rkey={rkey} />)
    }
    return <div class="message-decoration">
      {badges.length < 1
        ? null
        : <div class="message-reactions">
          <div>
            {badges}
          </div>
        </div>
      }
      {props.children}
    </div>
  }
}

class Badge extends Component {
  checkEmoji = _ => this.props.reactions.find(react =>
    react.getSender() === Client.client.getUserId() &&
    react.getContent()?.["m.relates_to"]?.key === this.props.rkey
  )

  increment = _ => {
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: this.props.event.getId(),
        key: this.props.rkey
      }
    })
  }

  decrement = reaction => {
    Client.client.redactEvent(reaction.getRoomId(), reaction.getId())
  }

  onClick = _ => {
    const isMarked = this.checkEmoji()
    if (isMarked) this.decrement(isMarked)
    else this.increment()
  }

  render(props) {
    return <div onClick={this.onClick} class="emoji-badge"><span>{props.rtable[props.rkey]}</span><span>{props.rkey}</span></div>
  }
}

class ActionsOnOthersMessages extends Component {
  constructor(props) {
    super(props)
    this.state = { selecting: null }
  }

  checkEmoji = emoji => this.props.reactions.some(react => {
    return react.getSender() === Client.client.getUserId() &&
      react.getContent()?.["m.relates_to"]?.key === emoji
  })

  componentDidUpdate(_, prevState) {
    if (!prevState.selecting && this.state.selecting) {
      window.addEventListener('click', this.clearCarefully)
    }
    if (!prevState.selecting && !this.state.selecting) {
      window.removeEventListener('click', this.clearCarefully)
    }
  }

  actions = createRef()

  picker = createRef()

  // necessary to clear component on mobile
  clearCarefully = e => {
    if (e.target === this.actions.current) return
    if (this.actions.current.contains(e.target)) return
    if (!document.body.contains(e.target)) return
    this.clearSelecting()
  }

  react = emoji => _ => {
    this.clearSelecting()
    if (this.checkEmoji(emoji)) return
    // we bail out if there's already a reaction from me.
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: this.props.event.getId(),
        key: emoji
      }
    })
  }

  handleEmojiClick = click => this.react(click.detail.unicode)()

  selectEmoji = _ => this.setState({ selecting: "emoji" })

  pickEmoji = _ => this.setState({ selecting: "emoji-picker" }, 
    _ => this.picker.current.shadowRoot.querySelector("input").focus())

  handleEmojiKeydown = e => e.stopPropagation() 

  clearSelecting = _ => this.setState({ selecting: null })

  render(props, state) {
    switch (state.selecting) {
      case "emoji-picker" : return <div ref={this.actions} onKeydown={this.handleEmojiKeydown} data-active class="message-actions">
          <emoji-picker ref={this.picker} onemoji-click={this.handleEmojiClick} />
          <button key="a" style={{position: "relative", left: "250px"}} onclick={this.clearSelecting}>{Icons.close}</button>
        </div>
      case "emoji" : return <div ref={this.actions} data-active class="message-actions">
          <button key="b" onclick={this.react("👍")}>👍</button>
          <button key="c" onclick={this.react("❤")}>❤</button>
          <button key="f" onclick={this.react("😲")}>😲</button>
          <button key="d" onclick={this.react("🤣")}>🤣</button>
          <button key="e" onclick={this.react("🤔")}>🤔</button>
          <button key="g" onclick={this.pickEmoji}>{Icons.moreHorizontal}</button>
        </div>
      default : return <div ref={this.actions} class="message-actions">
          {!props.responding && <ToolTip placement="top-start" theme="small" content="reply to this message">
            <button key="h" onclick={props.openEditor}>
              {Icons.reply}
            </button>
          </ToolTip>}
          <ToolTip placement="top-start" theme="small" content="React to this message">
            <button key="i" class="reaction" onclick={this.selectEmoji}>
            {Icons.like}
            </button>
          </ToolTip>
          {props.redactMessage 
            ? <ToolTip placement="top-end" theme="small" content="Delete this message">
                <button onclick={props.redactMessage} class="redact">
                {Icons.trash}
              </button>
              </ToolTip>
            : null
          }
        </div>
    }
  }
}

function ActionsOnOwnMessages(props) {
  return <div class="message-actions">
    {!props.responding && props.canEdit &&
      <ToolTip placement="top-end" theme="small" content="Edit this message">
        <button onclick={props.openEditor}>
        {Icons.edit}
        </button>
      </ToolTip>
    }
    <ToolTip placement="top-end" theme="small" content="Delete this message">
      <button onclick={props.redactMessage} class="redact">
      {Icons.trash}
      </button>
    </ToolTip>
  </div>
}

class MessageEditor extends Component {
  constructor(props) {
    super(props)
    this.currentContent = props.event.getContent()
    this.state = {
      value: Replies.isReply(this.currentContent) 
        ? Replies.stripFallbackPlainString(this.currentContent.body)
        : this.currentContent.body
    }
  }

  componentDidMount() {
    //We need to toggle these to get everything computed so that the second resize works
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
    this.resize()
  }

  input = createRef()

  handleKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      this.sendResponse()
    }
  }

  handleInput = (event) => this.setValue(event.target.value, this.resize())

  setValue = (value, cb) => this.setState({ value }, cb)

  resize = () => {
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
  }

  sendResponse = () => {
    const reader = new CommonMark.Parser()
    const writer = new CommonMark.HtmlRenderer()
    const parsed = reader.parse(processRegex(this.state.value))
    const rendered = writer.render(parsed)
    const theReplacementContent = {
      body: this.state.value,
      msgtype: "m.text",
      format: "org.matrix.custom.html",
      // TODO sanitize formattedBody before use
      formatted_body: rendered
    }
    if (Replies.isReply(this.currentContent)) {
      theReplacementContent["m.relates_to"] = this.currentContent["m.relates_to"]
      theReplacementContent.body = Replies.getReplyPrefixPlain(this.currentContent) + theReplacementContent.body
      theReplacementContent.formatted_body = Replies.getReplyPrefixHtml(this.currentContent) + theReplacementContent.formatted_body
    }
    const theReactionContent = {
      body: "an edit occurred", // fallback for clients that don't handle edits. we can do something more descriptive
      msgtype: "m.text",
      "m.new_content": theReplacementContent,
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: this.props.event.getId()
      }
    }
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", theReactionContent).then(_ => this.props.closeEditor())
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.event.getRoomId()} {...props} />,
    ":": props => <PopupMenu.Emojis {...props} />
  }

  render(_props, state) {
    return <div class="messageEditor">
      <PopupMenu.Menu
        textValue={state.value}
        textarea={this.input}
        actions={this.popupActions}
        setTextValue={this.setValue}
      />
      <textarea ref={this.input}
        value={state.value}
        onkeydown={this.handleKeydown}
        oninput={this.handleInput}
        data-gramm="false" // disable grammarly
      />
      <button onclick={this.sendResponse}>Надіслати зміни</button>
      <button onclick={this.props.closeEditor}>Відмінити</button>
    </div>
  }
}

class ReplyComposer extends Component {
  input = createRef()

  handleKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      this.sendResponse()
    }
  }

  handleInput = (event) => {
    this.setValue(event.target.value)
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
  }

  setValue = (value, cb) => this.setState({ value }, cb)

  sendResponse = () => {
    const reader = new CommonMark.Parser()
    const writer = new CommonMark.HtmlRenderer()
    const parsed = reader.parse(processRegex(this.state.value))
    const rendered = writer.render(parsed)
    Client.client.sendMessage(this.props.event.getRoomId(), {
      body: Replies.generateFallbackPlain(this.props.event) + this.state.value,
      formatted_body: Replies.generateFallbackHtml(this.props.event) + rendered,
      format: "org.matrix.custom.html",
      msgtype: "m.text",
      "m.relates_to": {
        "m.in_reply_to": {
          event_id: this.props.event.getId()
        }
      }
    }).then(_ => this.props.closeEditor())
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.event.getRoomId()} {...props} />,
    ":": props => <PopupMenu.Emojis {...props} />
  }

  render(_props, state) {
    return <div class="replyComposer">
      <PopupMenu.Menu
        textValue={state.value}
        textarea={this.input}
        setTextValue={this.setValue}
        actions={this.popupActions}
      />
      <textarea ref={this.input}
        value={state.value}
        onkeydown={this.handleKeydown}
        oninput={this.handleInput}
        data-gramm="false" // disable grammarly
      />
      <button onclick={this.sendResponse}>Надіслати відповідь</button>
      <button onclick={this.props.closeEditor}>Відмінити</button>
    </div>
  }
}
