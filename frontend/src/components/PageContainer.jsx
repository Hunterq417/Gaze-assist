function PageContainer({ children }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(120deg,#e9f4fb_0%,#e7defa_48%,#dfe8ff_100%)]">
      <div className="min-h-screen bg-white/12">{children}</div>
    </div>
  );
}

export default PageContainer;
