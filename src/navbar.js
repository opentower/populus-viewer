import { h, render, Fragment, Component } from 'preact';
import './styles/navbar.css'

class Navbar extends Component {
  page =

  render(props,state) {
  <div class="inner">{state.hasSelection ? <label class="navbutton annact" type="button" onclick={this.openAnnotation}>Add Annotation</label> : <label class="navbutton anninact" type="button">Add Annotation</label>}</div>
  <div class="inner">{props.pageFocused > 1 ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(props.pageFocused = 1)}>&laquo;</label> : <label class="navbutton arrowinact" type="button">&laquo;</label>}</div>
  <div class="inner">{props.pageFocused > 1 ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(props.pageFocused - 1)}>&lsaquo;</label> : <label type="button" class="navbutton arrowinact">&lsaquo;</label>}</div>
  <div class="inner"><input class="page" type="text" value={props.pageFocused}></input></div>
  <div class="inner">{state.totalPages > props.pageFocused ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(props.pageFocused + 1)}>&rsaquo;</label> : <label type="button" class="navbutton arrowinact">&rsaquo;</label>}</div>
  <div class="inner">{state.totalPages > props.pageFocused ? <label class="navbutton arrowact" type="button" onclick={_ => props.loadPage(props.pageFocused = state.totalPages)}>&raquo;</label> : <label type="button" class="navbutton arrowinact">&raquo;</label>}</div>
  <div class="inner">{(state.focus && ! state.hasSelection) ? <label class="navbutton annact" type="button" onclick={this.closeAnnotation}>Remove Annotation</label> : <label class="navbutton anninact" type="button">Remove Annotation</label>}</div>
}
}
