import { h, createRef, Fragment, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex } from './latex.js'
import katex from 'katex'
import UserColor from './userColors.js'
import { sanitizeHtmlParams, serverRoot } from './constants.js'
import * as Replies from './utils/replies.js'

export default class Message extends Component {

    constructor(props) {
        super(props)
        this.state = ({ responding: false })
    }

    componentDidMount() {
        this.processLatex()
    }

    componentDidUpdate(prevProps) {
        if (this.props.reactions[this.props.event.getId()] != prevProps.reactions[prevProps.event.getId()]) {
            this.processLatex()
        }
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

    closeEditor = () => this.setState({ responding: false, })

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

    render(props,state) {
        //there's some cleverness involving involving the unstable clientside
        //relation aggregation mechanism that we're not taking advantage of
        //here. Element doesn't seem to use this for replacements yet either.
        const event = props.event
        const upvotes = props.reactions[event.getId()]
                      ? props.reactions[event.getId()].filter(event => event.getContent()["m.relates_to"].rel_type == "m.annotation").length
                      : 0
        const content = this.getCurrentEdit()
        const isReply = Replies.isReply(content)
        const replyPreview = isReply ? <ReplyPreview client={props.client} reactions={this.props.reactions} event={event}/> : null
        const displayBody = <div ref={this.messageBody} class="body">
                               {replyPreview}
                               {((content.format == "org.matrix.custom.html") && content.formatted_body)
                                   ?  <div dangerouslySetInnerHTML={{__html : 
                                            sanitizeHtml(isReply ? sanitizeHtml(content.formatted_body,Replies.stripReply) : content.formatted_body, sanitizeHtmlParams)
                                      }}/>
                                   : <div class="body">{isReply ? Replies.stripFallbackPlain(content.body): content.body}</div>
                               }
                            </div>

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

class ReplyPreview extends Component {

    //eventually will want a mechanism for refreshing on receipt of edits
    componentDidMount() {
        this.getLiveEvent()
    }

    componentDidUpdate() {
        this.getLiveEvent()
    }

    async getLiveEvent() {
        if (!this.state.liveEvent) {
            const inReplyToId = this.props.event.getContent()["m.relates_to"]["m.in_reply_to"].event_id
            const roomId = this.props.event.getRoomId()
            const theRoom = this.props.client.getRoom(roomId)
            if (!theRoom) return //room state not ready
            const inReplyTo = theRoom.findEventById(inReplyToId)
            if (inReplyTo) {
                this.setState({ liveEvent : inReplyTo })
                return
            }
            try { 
                console.log("trying to retrive")
                // this uses the event-context route, which isn't implemented yet in Dendrite:
                //
                // https://github.com/matrix-org/dendrite/issues/670
                //
                // Hence, 404s right now.
                await this.props.client.getEventTimeline(theRoom.getUnfilteredTimelineSet(),inReplyToId) 
                console.log("retrived")
            } catch (e) { 
                console.log("couldn't retrieve")
                return
            }
            this.setState({ liveEvent : theRoom.findEventById(inReplyToId) })
        }
    }

    getCurrentEdit = () => {
        const edits = this.getEdits()
        //need to be smarter about ordering
        if (edits.length > 0) { return edits[edits.length - 1].getContent()["m.new_content"] }
        else { return this.state.liveEvent.getContent() }
    }

    getEdits = () => {
        return this.props.reactions[this.state.liveEvent.getId()]
            ? this.props.reactions[this.state.liveEvent.getId()]
            .filter(event => event.getContent()["m.relates_to"].rel_type == "m.replace")
            : []
    }

    fromLiveEvent = _ => {
        const content = this.getCurrentEdit()
        const hasHtml = (content.format == "org.matrix.custom.html") && content.formatted_body
        const isReply = Replies.isReply(content)
        const senderId = this.state.liveEvent.getSender()
        const sender = this.props.client.getUser(senderId)
        const senderName = this.props.client.getUser(senderId).displayName
        const senderColors = new UserColor(this.state.liveEvent.getSender())
        const avatarHttpURI = Matrix.getHttpUriForMxc(serverRoot, sender.avatarUrl, 20, 20, "crop")
        var displayBody 
        if (isReply && hasHtml) {
            displayBody = sanitizeHtml(content.formatted_body, Replies.stripReply)
        } else if (hasHtml) {
            displayBody = content.formatted_body
        } else if (isReply) {
            displayBody = stripFallbackPlainString(content.body)
        } else { displayBody = content.body }
        return <div style={senderColors.styleVariables} class="reply-preview">
            <div class="reply-preface">In reply to:</div>
            <div class="reply-sender-info">
                {avatarHttpURI ? <img src={avatarHttpURI}/> : null}
                <span>{sender.displayName}</span>
            </div>
            {hasHtml 
                ? <div dangerouslySetInnerHTML={{__html : displayBody}}/>
                : <div>{displayBody}</div>
            }
        </div>
    }

    fallbackPreview = _ => { 
        const content = this.props.event.getContent()
        const hasHtml = (content.format == "org.matrix.custom.html") && content.formatted_body
        const style = {'--user_light' : 'lightgray'}
        return hasHtml 
            ?  <div style={style} class="reply-preview reply-fallback" dangerouslySetInnerHTML={{__html : Replies.getFallbackHtml(content)}}/>
            :  <div style={style} class="reply-preview reply-fallback">{Replies.getFallbackPlain(content)}</div>
    }

    render(props,state) {
        if (state.liveEvent) return this.fromLiveEvent()
        else return this.fallbackPreview()
    }
}

class MessageEditor extends Component {

    componentDidMount () {
        this.currentContent = this.props.getCurrentEdit()
        if (Replies.isReply(this.currentContent)) { 
            this.setState({ value : Replies.stripFallbackPlainString(this.currentContent.body) })
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
