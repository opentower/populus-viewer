import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex } from './latex.js'
import katex from 'katex'
import UserColor from './userColors.js'

export default class Message extends Component {

    constructor(props) {
        super(props)
        this.state = ({
            editing : false,
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

    openEditor = () => this.setState({ editing : true, })

    closeEditor = () => {
        console.log("fired")
        this.setState({ editing : false, })
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
                                {!state.editing && <button onclick={this.openEditor}>edit</button>}
                                <button onclick={this.redactMessage} class="redact">delete</button>
                            </div>
                        </div>
                    </div>
                    {state.editing && <MessageEditor openEditor={this.openEditor}
                                                     closeEditor={this.closeEditor}
                                                     getCurrentEdit={this.getCurrentEdit}
                                                     client={this.props.client}
                                                     event={event}
                                      />}
                </Fragment>
            )
        } else {
            return (
                <div style={this.userColor.styleVariables} id={event.getId()} class="message">
                    <div class="ident">
                        <div class="info">
                            <button class="reaction" onclick={this.upvote}>+1</button>
                        </div>
                        {(upvotes > 0) && <span class="upvotes">+{upvotes}</span>}
                    </div>
                    {displayBody}
                </div>
            )
        }
    }
}
class ResponseInput extends Component {

    componentDidMount () {
        this.setState({ value : this.props.getCurrentEdit().body })
    }

    sendResponse = () => { }

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

    input = createRef()

    render(props,state) {
        return <div class="messageEditor">
                     <textarea ref={this.input} 
                               value={state.value}
                               onkeypress={this.handleKeypress}
                               oninput={this.handleInput}/>
                     <button onclick={this.sendResponse}>Submit Changes</button>
                     <button onclick={this.props.closeEditor}>Cancel</button>
               </div>
    }
}

class MessageEditor extends ResponseInput {
    sendResponse = () => {
        const reader = new CommonMark.Parser()
        const writer = new CommonMark.HtmlRenderer()
        const parsed = reader.parse(addLatex(this.state.value))
        const rendered = writer.render(parsed)
        this.props.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
            body : "an edit occurred", //fallback for clients that don't handle edits. we can do something more descriptive
            msgtype : "m.text",
            "m.new_content" : {
                body : this.state.value,
                msgtype : "m.text",
                format: "org.matrix.custom.html",
                formatted_body : rendered
            },
            "m.relates_to" : {
                rel_type : "m.replace",
                event_id : this.props.event.getId(),
            }
        }).then(_ => this.props.closeEditor())
    }
}


const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const transformTags = {
    // add blank targets to all hyperlinks except vector URLs
    'a': function(tagName, attribs) {
        if (attribs.href) { attribs.target = '_blank'; }
        attribs.rel = 'noreferrer noopener'; // https://mathiasbynens.github.io/rel-noopener/
        return { tagName, attribs };
    },
    'img': function(tagName, attribs) {
        //security for images is complicated, and they're not important for markdown right now.
        return { tagName, attribs: {}};
    },
    'code': function(tagName, attribs) {
        if (typeof attribs.class !== 'undefined') {
            // Filter out all classes other than ones starting with language- for syntax highlighting.
            const classes = attribs.class.split(/\s/).filter(function(cl) {
                return cl.startsWith('language-') && !cl.startsWith('language-_');
            });
            attribs.class = classes.join(' ');
        }
        return { tagName, attribs };
    },
    '*': function(tagName, attribs) {
        // Delete any style previously assigned, style is an allowedTag for font and span
        // because attributes are stripped after transforming
        delete attribs.style;

        // Sanitise and transform data-mx-color and data-mx-bg-color to their CSS
        // equivalents
        const customCSSMapper = {
            'data-mx-color': 'color',
            'data-mx-bg-color': 'background-color',
        };

        let style = "";
        Object.keys(customCSSMapper).forEach((customAttributeKey) => {
            const cssAttributeKey = customCSSMapper[customAttributeKey];
            const customAttributeValue = attribs[customAttributeKey];
            if (customAttributeValue &&
                typeof customAttributeValue === 'string' &&
                COLOR_REGEX.test(customAttributeValue)
            ) {
                style += cssAttributeKey + ":" + customAttributeValue + ";";
                delete attribs[customAttributeKey];
            }
        });

        if (style) { attribs.style = style; }

        return { tagName, attribs };
    },
};

// based on https://github.com/matrix-org/matrix-react-sdk/blob/78b1f6c0b13efd57031a329a1ac62baba948dad3/src/HtmlUtils.tsx
const sanitizeHtmlParams = {
    allowedTags: [
        'font', // custom to matrix for IRC-style font coloring
        'del', // for markdown
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'sup', 'sub',
        'nl', 'li', 'b', 'i', 'u', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
        'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
        'details', 'summary',
    ],
    allowedAttributes: {
        // custom ones first:
        font: ['color', 'data-mx-bg-color', 'data-mx-color', 'style'], // custom to matrix
        span: ['data-mx-maths', 'data-mx-bg-color', 'data-mx-color', 'data-mx-spoiler', 'style'], // custom to matrix
        div: ['data-mx-maths'],
        a: ['href', 'name', 'target', 'rel'], // remote target: custom to matrix
        img: ['src', 'width', 'height', 'alt', 'title'],
        ol: ['start'],
        code: ['class'], // We don't actually allow all classes, we filter them in transformTags
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
    // URL schemes we permit
    allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'magnet'],
    allowProtocolRelative: false,
    transformTags,
    // 50 levels deep "should be enough for anyone"
    nestingLimit: 50,
};
