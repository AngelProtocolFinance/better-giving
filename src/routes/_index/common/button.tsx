import { ArrowRight } from "lucide-react";

const Button = ({ text }: { text: string }) => {
  return (
    <button
      type="button"
      className="px-8 py-3.5 btn btn-primary rounded font-semibold flex items-center gap-1 self-center"
    >
      {text}
      <ArrowRight size={20} className=" ml-1" />
    </button>
  );
};

export default Button;
