import { h, Fragment } from 'preact';
import { UserColor } from './utils/colors.js'
import './styles/memberPill.css'

export default function MemberPill(props) {
  const colorFromId = new UserColor(props.member.userId)
  return (<Fragment>
    <span style={{background: colorFromId.light}} class="member-pill">{props.member.name}</span>
    <wbr />
  </Fragment>
  )
}
