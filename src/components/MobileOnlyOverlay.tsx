
export default function MobileOnlyOverlay() {
    return (
        <>
            <style>{`
        .mira-mobile-overlay { display: none; }
        @media (max-width: 767px) {
          .mira-mobile-overlay {
            display: flex;
            position: fixed;
            inset: 0;
            z-index: 99999;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            color: #fff;
            padding: 24px;
            text-align: center;
          }
          .mira-mobile-overlay .card {
            max-width: 520px;
            width: 100%;
            background: rgba(0,0,0,0.36);
            border-radius: 12px;
            padding: 22px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.06);
          }
          .mira-overlay-logo { display: block; margin: 0 auto 12px; max-width: 140px; height: auto; }
          .mira-mobile-overlay h2 { margin: 0 0 8px; font-size: 20px; font-weight:800; letter-spacing:0.02em; }
          .mira-mobile-overlay p { margin: 0; opacity: 0.94; font-size: 14px; }
        }
      `}</style>

            <div
                className="mira-mobile-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="Mira desktop only"
            >
                <div className="card">
                    <img src="/miratrans.png" alt="Mira" className="mira-overlay-logo" />
                    <h2>Mira is available on desktop only</h2>
                    <p>Please open Mira on a laptop or desktop browser for the full experience.</p>
                </div>
            </div>
        </>
    );
}
