import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex } from './latex.js'
import katex from 'katex'
import UserColor from './userColors.js'
import { sanitizeHtmlParams } from './constants.js'
import * as Replies from './utils/replies.js'

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
        if (Replies.isReply(this.currentContent)) {
            const lines = this.currentContent.body.trim().split('\n');
            Replies.stripFallbackPlain(lines)
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
        if (Replies.isReply(this.currentContent)) {
            theReplacementContent["m.relates_to"] = this.currentContent["m.relates_to"]
            theReplacementContent.body = Replies.getFallbackPlain(this.currentContent) + theReplacementContent.body
            theReplacementContent.formatted_body = Replies.getFallbackHtml(this.currentContent) + theReplacementContent.formatted_body
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
            body : Replies.generateFallbackPlain(this.props.event) + this.state.value,
            formatted_body : Replies.generateFallbackHtml(this.props.event) + rendered,
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

