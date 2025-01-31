const Spinner = ({ className }) => (
    <svg className={`animate-spin h-8 w-8 text-downy-500 ${className}`}>
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"/>
  <path className="opacity-75" fill="currentColor"/>
</svg>
  );
  
  export default Spinner;  // Changed to default export