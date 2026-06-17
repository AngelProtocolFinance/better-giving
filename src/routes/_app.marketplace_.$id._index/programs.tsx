import { Link } from "react-router";
import { Image } from "#/components/image";
import { RichText } from "#/components/rich-text";
import type { IProgramDb } from "@/npo";

export function Programs({ programs }: { programs: IProgramDb[] }) {
  return (
    <div className="w-full h-full px-8 py-10 grid sm:grid-cols-[repeat(auto-fill,minmax(373px,1fr))] gap-8">
      {programs.map((p) => (
        <Program {...p} key={p.id} />
      ))}
    </div>
  );
}

function Program(props: IProgramDb) {
  return (
    <div className="border rounded relative group overflow-hidden">
      <Link
        to={`program/${props.id}`}
        className="absolute inset-0 group-hover:border group-hover:border-primary dark:group-hover:border-primary"
      />
      <Image src={props.banner} className="h-64 w-full object-cover" />
      <div className="p-5">
        <p className="text-lg font-bold mb-3 block">{props.title}</p>
        <RichText
          content={{ value: props.description_pt }}
          readOnly
          classes={{ field: "overflow-hidden h-32" }}
        />
      </div>
    </div>
  );
}
