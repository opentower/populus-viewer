import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex } from './latex.js'
import katex from 'katex'
import UserColor from './userColors.js'
import { sanitizeHtmlParams } from './constants.js'

function isReply(content) {
    return !!(content["m.relates_to"] && content["m.relates_to"]["m.in_reply_to"])
}

function stripFallbackPlain(lines) {
    // Removes lines beginning with `> ` until you reach one that doesn't.
    while (lines.length && lines[0].startsWith('> ')) lines.shift();
    // Reply fallback has a blank line after it, so remove it to prevent leading newline
    if (lines[0] === '') lines.shift();
}

function generateFallbackPlain(event) {
    const targetBody = event.getContent().body
    const targetSender = event.getSender()
    const lines = targetBody.trim().split('\n');
    //strip previous fallback, if replying to a reply
    if (isReply(event.getContent())) stripFallbackPlain(lines)
    if (lines.length > 0) { lines[0] = `<${targetSender}> ${lines[0]}` }
    return lines.map((line) => `> ${line}`).join('\n') + '\n\n';
    //TODO eventually want to handle replying to images and so on, once these are displayable
}

function generateFallbackHtml(event) {
    const targetHTML = event.getContent().formatted_body || event.getContent().body.replace(/\n/g, '<br>')
    const targetSender = event.getSender()
    const sanitizedHTML = sanitizeHtml(targetHTML, stripReply)
    return (`<mx-reply><blockquote><a href="https://matrix.to/#/${event.getRoomId()}/${event.getId()}">In reply to</a>`
        + ` <a href="https://matrix.to/#/${targetSender}">${targetSender}</a>` 
        + `<br>${sanitizedHTML}</blockquote></mx-reply>`)
}

//based on https://github.com/matrix-org/matrix-react-sdk/blob/33e8edb3d508d6eefb354819ca693b7accc695e7/src/components/views/rooms/EditMessageComposer.js
function getFallbackHtml(content) {
    const html = content.formatted_body
    if (!html) return ""
    const rootNode = new DOMParser().parseFromString(html, "text/html").body
    const mxReply = rootNode.querySelector("mx-reply")
    return mxReply ? mxReply.outerHTML : ""
}

function getFallbackPlain(content) {
    const body = content.body
    const lines = body.split("\n").map(l => l.trim())
    if (lines.length > 2 && lines[0].startsWith("> ") && lines[1].length === 0) {
        return `${lines[0]}\n\n`
    } else return ""
}

export default class Message extends Component {

    constructor(props) {
        super(props)
        this.state = ({
            responding: false,
        })
    }

    userColor = new UserColor(this.props.event.getSender())

    messageBody = createRef()

    upvote = () => {
        let reactions = this.props.reactions[this.props.event.getId()] || []
        if (reactions.some(react => react.getSender() == this.props.client.getUserId() )) return
        //we bail out if there's already a plus one from me.
        this.props.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
            "m.relates_to" : {
                rel_type : "m.annotation",
                event_id : this.props.event.getId(),
                key : "👍"
            }
        })
    }

    openEditor = () => this.setState({ responding: true, })

    closeEditor = () => {
        console.log("fired")
        this.setState({ responding: false, })
    }

    getCurrentEdit = () => {
        const edits = this.getEdits()
        //need to be smarter about ordering
        if (edits.length > 0) { return edits[edits.length - 1].getContent()["m.new_content"] }
        else { return this.props.event.getContent() }
    }

    getEdits = () => {
        return this.props.reactions[this.props.event.getId()]
            ? this.props.reactions[this.props.event.getId()]
            .filter(event => event.getContent()["m.relates_to"].rel_type == "m.replace")
            : []
    }

    redactMessage = () => {
        this.props.client.redactEvent(this.props.event.getRoomId(),this.props.event.getId())
    }

    processLatex() {
        if (this.messageBody.current) {
            const latexArray = Array.from(this.messageBody.current.querySelectorAll("[data-mx-maths]"))
            latexArray.forEach(elt => {
                if (elt.tagName == "DIV") katex.render(elt.dataset.mxMaths,elt,{displayMode:true, throwOnError:false})
                else katex.render(elt.dataset.mxMaths,elt,{throwOnError:false})
            })
        }
    }

    componentDidMount() {
        this.processLatex()
    }

    componentDidUpdate(prevProps) {
        if (this.props.reactions[this.props.event.getId()] != prevProps.reactions[prevProps.event.getId()]) {
            this.processLatex()
        }
    }

    render(props,state) {
        //there's some cleverness involving involving the unstable clientside
        //relation aggregation mechanism that we're not taking advantage of
        //here. Element doesn't seem to use this for replacements yet either.
        const event = props.event
        const upvotes = props.reactions[event.getId()]
                      ? props.reactions[event.getId()].filter(event => event.getContent()["m.relates_to"].rel_type == "m.annotation").length
                      : 0
        const content = this.getCurrentEdit()
        const displayBody = ((content.format == "org.matrix.custom.html") && content.formatted_body)
                          ? <div ref={this.messageBody} class="body"
                                 dangerouslySetInnerHTML={{__html : sanitizeHtml(content.formatted_body, sanitizeHtmlParams)}}
                            />
                          : <div class="body">{content.body}</div>

        if (props.client.getUserId() == event.getSender()) {
            return (
                <Fragment>
                    <div data-event-status={event.getAssociatedStatus()} id={event.getId()} style={this.userColor.styleVariables} class="message me">
                        {displayBody}
                        <div class="ident">
                            {(upvotes > 0) && <span class="upvotes">+{upvotes}</span>}
                            <div class="info">
                                {!state.responding && <button onclick={this.openEditor}>edit</button>}
                                <button onclick={this.redactMessage} class="redact">delete</button>
                            </div>
                        </div>
                    </div>
                    {state.responding && <MessageEditor closeEditor={this.closeEditor}
                                                     getCurrentEdit={this.getCurrentEdit}
                                                     client={this.props.client}
                                                     event={event}
                                      />}
                </Fragment>
            )
        } else {
            return (
                <Fragment>
                    <div style={this.userColor.styleVariables} id={event.getId()} class="message">
                        <div class="ident">
                            <div class="info">
                                {!state.replying && <button onclick={this.openEditor}>reply</button>}
                                <button class="reaction" onclick={this.upvote}>+1</button>
                            </div>
                            {(upvotes > 0) && <span class="upvotes">+{upvotes}</span>}
                        </div>
                        {displayBody}
                    </div>
                    {state.responding && <ReplyComposer closeEditor={this.closeEditor}
                                                        getCurrentEdit={this.getCurrentEdit}
                                                        client={this.props.client}
                                                        event={event}
                                      />}
                </Fragment>
            )
        }
    }
}

class MessageEditor extends Component {

    componentDidMount () {
        this.currentContent = this.props.getCurrentEdit()
        if (isReply(this.currentContent)) {
            const lines = this.currentContent.body.trim().split('\n');
            stripFallbackPlain(lines)
            this.setState({ value : lines.join('\n') })
        } else this.setState({ value : this.currentContent.body })
    }

    input = createRef()

    handleKeypress = (event) => {
        if (event.code == "Enter" && event.ctrlKey) {
            event.preventDefault()
            this.sendResponse()
        }
    }

    handleInput = (event) => {
        this.setState({ value : event.target.value })
        this.input.current.style.height = 'auto';
        this.input.current.style.height = this.input.current.scrollHeight+'px';
    }

    sendResponse = () => {
        const reader = new CommonMark.Parser()
        const writer = new CommonMark.HtmlRenderer()
        const parsed = reader.parse(addLatex(this.state.value))
        const rendered = writer.render(parsed)
        const theReplacementContent = {
            body : this.state.value,
            msgtype : "m.text",
            format: "org.matrix.custom.html",
            //TODO sanitize formattedBody before use
            formatted_body : rendered
        }
        if (isReply(this.currentContent)) {
            theReplacementContent["m.relates_to"] = this.currentContent["m.relates_to"]
            theReplacementContent.body = getFallbackPlain(this.currentContent) + theReplacementContent.body
            theReplacementContent.formatted_body = getFallbackHtml(this.currentContent) + theReplacementContent.formatted_body
        }
        const theReactionContent = {
            body : "an edit occurred", //fallback for clients that don't handle edits. we can do something more descriptive
            msgtype : "m.text",
            "m.new_content" : theReplacementContent,
            "m.relates_to" : {
                rel_type : "m.replace",
                event_id : this.props.event.getId(),
            }
        }
        this.props.client.sendEvent(this.props.event.getRoomId(), "m.reaction", theReactionContent).then(_ => this.props.closeEditor())
    }

    render(props,state) {
        return <div class="replyComposer">
                     <textarea ref={this.input} 
                               value={state.value}
                               onkeypress={this.handleKeypress}
                               oninput={this.handleInput}/>
                     <button onclick={this.sendResponse}>Submit Changes</button>
                     <button onclick={this.props.closeEditor}>Cancel</button>
               </div>
    }
}

class ReplyComposer extends Component {

    input = createRef()

    handleKeypress = (event) => {
        if (event.code == "Enter" && event.ctrlKey) {
            event.preventDefault()
            this.sendResponse()
        }
    }

    handleInput = (event) => {
        this.setState({ value : event.target.value })
        this.input.current.style.height = 'auto';
        this.input.current.style.height = this.input.current.scrollHeight+'px';
    }

    sendResponse = () => {
        const reader = new CommonMark.Parser()
        const writer = new CommonMark.HtmlRenderer()
        const parsed = reader.parse(addLatex(this.state.value))
        const rendered = writer.render(parsed)
        this.props.client.sendMessage(this.props.event.getRoomId(), {
            body : generateFallbackPlain(this.props.event) + this.state.value,
            formatted_body : generateFallbackHtml(this.props.event) + rendered,
            format: "org.matrix.custom.html",
            msgtype : "m.text",
            "m.relates_to" : {
                "m.in_reply_to" : {
                    event_id : this.props.event.getId(),
                }
            }
        }).then(_ => this.props.closeEditor())
    }

    render(props,state) {
        return <div class="replyComposer">
                     <textarea ref={this.input} 
                               value={state.value}
                               onkeypress={this.handleKeypress}
                               oninput={this.handleInput}/>
                     <button onclick={this.sendResponse}>Send Reply</button>
                     <button onclick={this.props.closeEditor}>Cancel</button>
               </div>
    }
}

const stripReply = {
    allowedTags: false, // false means allow everything
    allowedAttributes: false,
    // we somehow can't allow all schemes, so we allow all that we
    // know of and mxc (for img tags)
    allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'magnet', 'mxc'],
    exclusiveFilter: (frame) => frame.tag === "mx-reply",
}
