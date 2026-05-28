{ useState } from 'react';
import { motion from 'framer-motionimport { useNavigate } 'react-router-dom';

const Pricing () => {
  constisYearly, setYearly] = useState);
  const [selected, setSelectedPlan] useState(null);
  const [show, setShowToast] useState(false);
  const [toastMessage, setToastMessage] = useState  const navigate = use();

  const plans =    {
      id: 'starter',
      name: 'Starter',
     Price: 0,
 yearlyPrice: 0      description: 'Perfect for individuals and side projects',
      features: [
        '3 AI generations per day        'Basic project templates',
       Community support',
        '1 active project',
        'Standard preview environment'
      ],
      popular: false,
      cta: 'Get Free'
    },
    {
      id: 'pro',
      name: 'Pro',
      monthlyPrice: 29,
      yearlyPrice: 290,
      description: 'For serious creators building real products',
      features: [
        'Unlimited AI generations',
       Advanced code editor & preview',
        'Priority AI workspace access',
        '10 active projects',
        'Live collaboration',
        'Export to GitHub',
        'Priority support      ],
      popular: true,
      cta: 'Start Pro Trial'
    },
    {
      id: 'team',
      name: 'Team      monthlyPrice: 79,
      yearlyPrice: 790,
      description: 'Built for startups and growing',
      features: [
        'Everything in Pro',
        'Unlimited projects & collaborators',
 'Custom AI model fine-tuning',
        'Advanced analytics dashboard',
        'SSO & team permissions',
        'Dedicated account manager',
        'SLA & 99.9% uptime guarantee'
      ],
      popular: false,
      cta: 'Contact Sales'
    }
  ];

  const getPrice = (plan) => {
    return isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  };

  const getPeriod = () => {
    returnYearly ? '/year' : '/month';
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan.id);
    
    if (plan.id === 'team') {
      navigate('/contact');
    } else {
      setToastMessage(`${plan.name} plan selected Redirecting to checkout...`);
      setShowToast(true);
      
      setTimeout(() => {
        setShowToast(false        if (plan.monthlyPrice === 0) {
          navigate('/register');
        } else {
          navigate('/dashboard');
             }, 1200);
    }
  };

  const handleToggle = () => {
    setIsYearly(!isYearly);
    setSelectedPlan(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-20 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-1.5 rounded-full bg-zinc-900 border border-cyan-500/30 text-cyan-400 text-sm font-medium mb-4">
            PRICING
          </div>
          <h1 className="text-6xl font-semibold tracking-tighter mb-4">Build without limits.</h1>
          <p className="text-xl text-zinc-400 max-w-md mx-auto">
            Choose the plan that matches your ambition. Cancel anytime.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-1">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                !isYearly 
                  ? 'bg-white text-zinc-950 shadow-lg' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={handleToggle}
              className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                isYearly 
                  ? 'bg-white text-zinc-950 shadow-lg' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Yearly
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500 text-white rounded-full font-mono">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const price = getPrice(plan);
            const isSelected = selectedPlan === plan.id;
            
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative group rounded-3xl p-8 flex flex-col border transition-all duration-300 cursor-pointer
                  ${plan.popular 
                    ? 'border-cyan-500 bg-zinc-900/90' 
                    : 'border-zinc-800 bg-zinc-900/60'
                  }
                  ${isSelected 
                    ? 'ring-2 ring-cyan-400 shadow-[0_0_60px_-15px_rgb(103,232,249)] scale-[1.015]' 
                    : 'hover:border-zinc-700'
                  }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-xs font-semibold tracking-[1px] text-zinc-950">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-8">
                  <div className="font-semibold text-2xl mb-1 tracking-tight">{plan.name}</div>
                  <div className="text-zinc-400 text-sm h-10">{plan.description}</div>
                </div>

                <div className="mb-8 flex items-baseline">
                  <span className="text-7xl font-semibold tabular-nums tracking-tighter">
                    ${price}
                  </span>
                  <span className="text-zinc-400 ml-1.5 text-lg font-medium">
                    {getPeriod()}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPlan(plan);
                  }}
                  className={`w-full py-3.5 rounded-2xl font-medium text-sm tracking-wider transition-all active:scale-[0.985] mb-9
                    ${plan.popular 
                      ? 'bg-white text-zinc-950 hover:bg-zinc-100' 
                      : isSelected 
                        ? 'bg-cyan-400 text-zinc-950' 
                        : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'
                    }`}
                >
                  {plan.cta}
                </button>

                <div className="space-y-3.5 text-sm flex-1">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-zinc-300">
                      <div className="mt-1 text-cyan-400">→</div>
                      <div>{feature}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Trust Bar */}
        <div className="mt-16 pt-10 border-t border-zinc-800 text-center">
          <div className="text-xs uppercase tracking-[3px] text-zinc-500 mb-4">TRUSTED BY THE BEST</div>
          <div className="flex justify-center items-center gap-x-12 text-zinc-400 text-sm font-medium">
            <div>Linear</div>
            <div>Vercel</div>
            <div>Perplexity</div>
            <div>Replicate</div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="px-6 py-3.5 rounded-2xl bg-zinc-900 border border-cyan-500/30 text-cyan-400 text-sm flex items-center gap-3 shadow-2xl">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;