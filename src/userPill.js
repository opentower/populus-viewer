import { h, Fragment } from 'preact';
import { UserColor } from './utils/colors.js'
import './styles/memberPill.css'

export default function UserPill(props) {
  const colorFromId = new UserColor(props.user.userId || props.user.user_id)
  return (<Fragment>
    <span style={{background: colorFromId.light}} class="member-pill">{props.user.displayName || props.user.display_name}</span>
    <wbr />
  </Fragment>
  )
}
