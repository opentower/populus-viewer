import { h, createRef, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import ToolTip from "./utils/tooltip.js"
import './styles/navbar.css';
import History from './history.js'
import Resource from "./utils/resource.js"
import Client from './client.js'
import Modal from './modal.js'
import ManageMembership from './manageMembership.js'

export default class ImageNavbar extends Component {
  constructor(props) {
    super(props);
    // Could add a listener to update this live
    const roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.canAnnotate = roomState.maySendStateEvent(Matrix.EventType.SpaceChild, Client.client.getUserId())
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeydown)
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  handleKeydown = e => { }

  timeCurrent = createRef()

  timeTotal = createRef()

  toolTipOffset = [0, 30]

  mainMenu = _ => History.push("/")

  download = _ => {
    if (confirm("do you want to download the image you're annotating?")) {
      const file = new Resource(this.props.room)
      window.open(file.httpUrl)
    }
  }

  play = _ => this.props.content.current.play()

  pause = _ => this.props.content.current.pause()

  zoomOut = _ => this.props.setZoom(zoomFactor => zoomFactor - 0.1)

  zoomIn = _ => this.props.setZoom(zoomFactor => zoomFactor + 0.1)

  toggleMoreOptions = _ => {
    if (this.state.moreOptionsVisible) this.props.setNavHeight(75)
    else this.props.setNavHeight(150)
    this.setState(oldState => { return {moreOptionsVisible: !oldState.moreOptionsVisible} })
  }

  openMembership = _ => Modal.set(<ManageMembership room={this.props.room} />, "Управління доступом", `для ${this.props.room.name}`)

  render(props, state) {

    const annotationStatus = !props.hasSelection 
      ? "Select an area to annotate"
      : !this.canAnnotate
      ? "Annotation restricted"
      : false

    if (props.contentWidthPx) { // don't render until width is set
      return <nav id="page-nav">
        <div id="nav-background" />
        <div class="nav-button-wrapper top-wrapper">
          <ToolTip content="Go to main menu (ESC)" offset={this.toolTipOffset}>
            <button onclick={this.mainMenu}>{Icons.home}</button>
          </ToolTip>
          <ToolTip content={annotationStatus || "Add annotation (Alt + a)"} offset={this.toolTipOffset} >
            <div class="nav-button-tip-wrapper">
              <button disabled={annotationStatus ?  "disabled": null}
                onclick={props.openAnnotation}>{Icons.addAnnotation}
              </button>
            </div>
          </ToolTip>
          <ToolTip content="Go to previous annotation (Alt + Shift + Tab)" offset={this.toolTipOffset}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusPrev}>{Icons.chevronsLeft}
            </button>
          </ToolTip>
          <ToolTip content="Zoom out (-)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.zoomOut}>{Icons.zoomout}</button>
          </ToolTip>
          <ToolTip content="Zoom in (+)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.zoomIn}>{Icons.zoomin}</button>
          </ToolTip>
          <ToolTip content="Go to next annotation (Alt + Tab)" offset={[0, 30]}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusNext}>{Icons.chevronsRight}
            </button>
          </ToolTip>
          <ToolTip content="Remove annotation (Alt + r)" offset={this.toolTipOffset}>
            <button disabled={props.focus && !props.hasSelection ? null : "disabled"}
              onclick={props.closeAnnotation}>{Icons.removeAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="More options" offset={this.toolTipOffset}>
            <button onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
          </ToolTip>
        </div>
        <div ref={this.bottomWrapper} data-searchFocused={state.searchFocused} class="nav-button-wrapper bottom-wrapper">
          <ToolTip content="Manage membership" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.openMembership}>{Icons.userPlus}
            </button>
          </ToolTip>
          <ToolTip content="Download Media" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={this.download}>{Icons.download} </button>
          </ToolTip>
          <ToolTip content="Toggle annotation visibility (Alt + v)" theme="bordered">
            <button tabIndex={state.moreOptionsVisible ? 0 : -1} onClick={props.toggleAnnotations}>{props.annotationsVisible ? Icons.eyeOff : Icons.eye}</button>
          </ToolTip>
        </div>
      </nav>
    }
  }
}
