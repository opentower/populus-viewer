import { h, Fragment } from 'preact';
import { UserColor } from './utils/colors.js'
import './styles/memberPill.css'

export default function MemberPill(props) {
  const colorFromId = new UserColor(props.member.userId)
  return <span style={colorFromId.styleVariables} class="member-pill">{props.member.name}</span>
}
