import LoadingSpinner from "./LoadingSpinner";

export const LoadingScreen = () => {
  return (
    <div className="bg-foreground/50 fixed inset-0 z-50 flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
};
