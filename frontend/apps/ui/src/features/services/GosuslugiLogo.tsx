import gosuslugiUrl from "./gosuslugi.svg?url"
import classes from "@/features/services/Services.module.css"

type Args = {
  size?: number
}

export default function GosuslugiLogo({size = 56}: Args) {
  return (
    <img
      className={`${classes.logo} ${classes.gosuslugiLogo}`}
      src={gosuslugiUrl}
      width={size}
      height={size}
      alt=""
    />
  )
}
