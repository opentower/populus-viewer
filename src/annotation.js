import { h, createRef, Component } from 'preact';
import * as Layout from "./utils/layout.js"
import * as Matrix from "matrix-js-sdk"
import { UserColor } from "./utils/colors.js"
import QuadPoints from './utils/quadPoints.js'
import Client from './client.js'
import './styles/annotation-layer.css'
import * as Icons from './icons.js'

export default class AnnotationLayer extends Component {
  constructor(props) {
    super(props)
    this.state = {typing: {}}
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentDidUnmount () {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (event, member) => {
    const theRoomState = Client.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(Matrix.EventType.SpaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const myId = Client.client.getUserId()
        const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
        return {typing: { ...prevState.typing, [member.roomId]: typingOtherThanMe}}
      })
    }
  }

  filterAnnotations = loc => loc.getPageIndex() === parseInt(this.props.pageFocused, 10)

  sortAnnotations = (a,b) => {
    if (!a.getRect() || !b.getRect()) return 0
    if (a.getRect().top < b.getRect().top) return 1
    if (b.getRect().top < a.getRect().top) return -1
    return 0
  }

  updateGutter(gutter, loc) {
    for (const key in gutter) {
      if (gutter[key].getRect().bottom >= loc.getRect().top) delete gutter[key]
    }
    let key = 0
    while (true) {
      if (gutter[key]) {
        key++
        continue
      }
      gutter[key] = loc
      return key
    }
  }

  getAnnotations() {
    const theRoom = Client.client.getRoom(this.props.roomId)
    const focusId = this.props.focus?.getChild()
    let annotations = []
    if (theRoom) {
      let didFocus = false
      // We filter to include only the annotations on the page
      const annotationData = this.props.filteredAnnotationContents
        .filter(loc => {
          if (loc.getChild() === this.props.focus?.getChild()) didFocus = true
          return this.filterAnnotations(loc)
        }).sort(this.sortAnnotations)
      // We add the secondary focus
      if (this.props.secondaryFocus && this.filterAnnotations(this.props.secondaryFocus)) annotationData.push(this.props.secondaryFocus)
      // We add the focus back in if it's on the page but got screened out of filteredAnnotationContents
      if (this.props.focus && this.filterAnnotations(this.props.focus) && !didFocus) annotationData.push(this.props.focus)
      // We turn the array into annontation components
      const leftGutter = {}
      const rightGutter = {}
      annotations = annotationData.map(loc => {
        const annotationId = loc.getChild()
        const rightSide = this.props.fixedSide 
          ? this.props.fixedSide === "right"
          : null 
        switch (loc.getType()) {
          case 'text': return <Pindrop
            key={loc.event.getId()}
            focused={focusId === annotationId}
            typing={this.state.typing[annotationId]}
            pdfWidthAdjustedPx={this.props.pdfWidthAdjustedPx}
            pdfHeightAdjustedPx={this.props.pdfHeightAdjustedPx}
            setFocus={this.props.setFocus}
            location={loc} />
          case 'highlight': {
            let gutterDepth
            if (rightSide) gutterDepth = this.updateGutter(rightGutter, loc)
            else gutterDepth = this.updateGutter(leftGutter, loc)
            return <Highlight
              zoomFactor={this.props.zoomFactor}
              key={loc.event.getId()}
              focused={focusId === annotationId}
              typing={this.state.typing[annotationId]}
              rightSide={rightSide}
              gutterDepth={gutterDepth}
              setFocus={this.props.setFocus}
              pdfWidthAdjustedPx={this.props.pdfWidthAdjustedPx}
              pdfHeightAdjustedPx={this.props.pdfHeightAdjustedPx}
              location={loc} />
          }
        }
      })
    }
    return annotations
  }

  render(props) {
    return (
      <div
        ref={props.annotationLayerWrapper}
        data-annotation-focused={!!props.focus}
        class="annotation-layer">
        {this.getAnnotations()}
        {props.pindropMode?.x ? <PindropPreview coordinates={props.pindropMode} /> : null}
      </div>
    )
  }
}

function PindropPreview (props) {
  const style = {
    left: `${props.coordinates.x}px`,
    top: `${props.coordinates.y}px`
  }
  return <span
    class="annotation-pindrop annotation-pindrop-preview"
    data-annotation
    style={style}>
    {Icons.pin}
  </span>
}

class Pindrop extends Component {
  shouldComponentUpdate(nextProps) {
    if (nextProps.pdfWidthAdjusted === 0) return false
    if (nextProps.pdfHeightAdjustedPx === this.props.pdfHeightAdjustedPx) return
    if (!this.positioned) {
      this.left = this.props.location.getRect().left
      this.top = nextProps.pdfHeightAdjustedPx - this.props.location.getRect().top
    }
  }

  setFocus = _ => this.props.setFocus(this.props.location)

  userColor = new UserColor(this.props.location.getCreator())

  left = this.props.location.getRect().left

  top = this.props.pdfHeightAdjustedPx - this.props.location.getRect().top

  render(props) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <span
      onclick={this.setFocus}
      class="annotation-pindrop"
      data-focused={props.focused}
      data-annotation-typing={typing}
      data-annotation
      style={{
        left: `${this.left}px`,
        top: `${this.top}px`,
        ...this.userColor.styleVariables
      }}>
      {Icons.pin}
    </span>
  }
}

class Highlight extends Component {
  constructor(props) {
    super(props)
    this.state = {rightSide: this.calculateSide(props)}
  }

  calculateSide(props) {
      if (props.pdfWidthAdjustedPx > this.boundingRect.width * 2) {
        const rightMargin = props.pdfWidthAdjustedPx - (this.boundingRect.width + this.boundingRect.x)
        if (rightMargin < this.boundingRect.x) return true
        else return false
      } else {
        return props.location.getChild().charCodeAt(1) % 2 === 1
      }
  }

  shouldComponentUpdate(nextProps) {
    if (nextProps.pdfWidthAdjustedPx === 0) return false
    if (nextProps.pdfHeightAdjustedPx === this.props.pdfHeightAdjustedPx) return
    if (!this.positioned) {
      this.boundingRect = new DOMRect(
        this.props.location.getRect().left,
        nextProps.pdfHeightAdjustedPx - this.props.location.getRect().top,
        this.props.location.getRect().right - this.props.location.getRect().left,
        this.props.location.getRect().top - this.props.location.getRect().bottom
      )
      this.clientRects = this.props.location.getQuadPoints().map(qp =>
        QuadPoints.fromQuadArray(qp).toDOMRectInHeight(nextProps.pdfHeightAdjustedPx)
      )
      this.setState({rightSide: this.calculateSide(nextProps)})
    }
  }

  setFocus = _ => this.props.setFocus(this.props.location)

  roomId = this.props.location.getChild()

  clientRects = this.props.location.getQuadPoints().map(qp =>
    QuadPoints.fromQuadArray(qp).toDOMRectInHeight(this.props.pdfHeightAdjustedPx)
  )

  boundingRect = new DOMRect(
    this.props.location.getRect().left,
    this.props.pdfHeightAdjustedPx - this.props.location.getRect().top,
    this.props.location.getRect().right - this.props.location.getRect().left,
    this.props.location.getRect().top - this.props.location.getRect().bottom
  )

  userColor = new UserColor(this.props.location.getCreator())

  render(props, state) {
    if (!this.props.pdfWidthAdjustedPx) return null
    const spans = this.clientRects.map(
      rect => <RectSpan
        pdfWidthAdjustedPx={this.props.pdfWidthAdjustedPx}
        key={rect}
        zoomFactor={this.props.zoomFactor}
        setFocus={this.setFocus}
        rect={rect}
      />
    )
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <div
      style={this.userColor.styleVariables}
      data-annotation-typing={typing}
      data-focused={props.focused}
      id={this.roomId}>
      <BarTab
        pdfWidthAdjustedPx={props.pdfWidthAdjustedPx}
        rightSide={props.rightSide ?? state.rightSide}
        gutterDepth={props.gutterDepth}
        rect={this.boundingRect}
        zoomFactor={props.zoomFactor}
        setFocus={this.setFocus} />
      <div class="inline-annotations">
        {spans}
      </div>
    </div>
  }
}

class BarTab extends Component {
  componentDidMount() {
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, 1)
  }

  componentDidUpdate() {
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor)
  }

  ref = createRef()

  getTabRect = _ => {
    return this.props.rightSide
      ? new DOMRect(this.props.pdfWidthAdjustedPx - 10 + (this.props.gutterDepth * 10), this.props.rect.y, 3, this.props.rect.height)
      : new DOMRect(5 - (this.props.gutterDepth * 10), this.props.rect.y, 3, this.props.rect.height)
  }

  render(props) {
    return <span
      onclick={props.setFocus}
      class="annotation-bartab"
      data-annotation
      ref={this.ref}
    />
  }
}

class RectSpan extends Component {
  ref = createRef()

  componentDidMount() { 
    Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) 
  }

  componentDidUpdate() { 
    Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) 
  }

  render(props) {
    return <span onclick={props.setFocus} data-annotation ref={this.ref} />
  }
}
