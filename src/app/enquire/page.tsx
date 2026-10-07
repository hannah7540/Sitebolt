import { redirect } from "next/navigation";

export default function EnquirePage() {
  redirect("/marketing?enquire=1");
}
