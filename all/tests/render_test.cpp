// Executes arithmetic translated from the shipped GenExpr, not a separate DSP rewrite.
#define ALL_TRACE 1
#include "all_model.hpp"
#include <iostream>
#include <limits>
#include <set>
#include <string>

static int checks=0;
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void near(double a,double b,const char* message,double eps=1e-10){require(std::abs(a-b)<=eps,message);}
template<class F> void check(const char* name,F run){run();checks++;std::cout<<"PASS "<<name<<"\n";}

void freeze_motion(AllMotion& m,double seed,double sr,double value){
    m.hSeed=seed;m.hRate=sr;m.hWait=1e12;m.hAge=0;m.hPeriod=1;
    m.hValue=value;m.hFrom=value;m.hTo=value;m.hShape=0;
}
void freeze(AllEngine& e,double seed,double wa,double wb,double wc,
            double ll=1,double rr=1,double lr=0,double rl=0,double dl=0,double dr=0){
    freeze_motion(e.all_motion0,seed,e.samplerate,ll);
    freeze_motion(e.all_motion1,seed,e.samplerate,rr);
    freeze_motion(e.all_motion2,seed,e.samplerate,lr);
    freeze_motion(e.all_motion3,seed,e.samplerate,rl);
    freeze_motion(e.all_motion4,seed,e.samplerate,dl);
    freeze_motion(e.all_motion5,seed,e.samplerate,dr);
    auto& s=e.all_scene0;s.hSeed=seed;s.hRate=e.samplerate;s.hWait=1e12;
    s.hAge=0;s.hPeriod=1;s.hShape=0;
    s.hFa=wa;s.hTa=wa;s.hVa=wa;s.hFb=wb;s.hTb=wb;s.hVb=wb;s.hFc=wc;s.hTc=wc;s.hVc=wc;
    s.hStereo=0;s.hNonlinear=0;s.hPlace=0;s.hDrive=1;s.hLevels=16;s.hFeedback=0;s.hParallel=0.5;
}
void gain(AllEngine& e,double seed,double ll,double rr){
    freeze_motion(e.all_motion0,seed,e.samplerate,ll);
    freeze_motion(e.all_motion1,seed,e.samplerate,rr);
}

double shape(double value,int mode,double drive,double levels){
    double x=value*drive;
    switch(mode){
    case 1:return std::clamp(x,-1.,1.);
    case 2:{double t=std::fmod(x+1,4.);if(t<0)t+=4;return 1-std::abs(t-2);}
    case 3:return std::floor(std::clamp(x,-1.,1.)*levels+0.5)/levels;
    case 4:return x/(1+std::abs(x));
    default:return value;
    }
}

int main(){try{
    constexpr double seed=1234567;
    check("silence stays exactly silent through all internal random processing",[&]{
        AllEngine e(48000);
        for(int n=0;n<1000000;n++){auto y=e.tick(0,0,1,seed);require(y[0]==0&&y[1]==0,"autonomous audio appeared");}
    });
    check("Dry/Wet endpoints and intermediate mixes match independent running wet state",[&]{
        AllEngine dry(48000),wet(48000),mix(48000);
        for(int n=0;n<200000;n++){
            double l=.7*std::sin(n*.057),r=.5*std::cos(n*.031),m=(n%1001)/1000.;
            auto a=dry.tick(l,r,0,seed),b=wet.tick(l,r,1,seed),c=mix.tick(l,r,m,seed);
            require(a[0]==l&&a[1]==r,"dry path changed input");
            near(c[0],(1-m)*l+m*b[0],"left mix mismatch");near(c[1],(1-m)*r+m*b[1],"right mix mismatch");
        }
    });
    check("zero and integer stereo delays produce exact impulse positions",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,0,1,1,0,0,5,17);
        for(int n=0;n<40;n++){auto y=e.tick(n==0?1:0,n==0?.5:0,1,seed);
            near(y[0],n==5?1:0,"left integer impulse");near(y[1],n==17?.5:0,"right integer impulse");}
    });
    check("ring wrap and two-second maximum delay preserve real sample history",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,0,1,1,0,0,96000,1);
        for(int n=0;n<650000;n++){
            auto y=e.tick(n==0||n==524287?1:0,n==524288?1:0,1,seed);
            near(y[0],n==96000||n==620287?1:0,"wrapped maximum delay");
            near(y[1],n==524289?1:0,"wrapped one-sample delay");
        }
    });
    check("gain before and after delay are distinct and use the correct histories",[&]{
        AllEngine a(48000),b(48000);freeze(a,seed,1,0,0,1,1,0,0,3,3);freeze(b,seed,0,1,0,1,1,0,0,3,3);
        for(int n=0;n<12;n++){
            if(n==5){gain(a,seed,0,0);gain(b,seed,0,0);}
            auto ya=a.tick(1,1,1,seed),yb=b.tick(1,1,1,seed);
            near(ya[0],n>=3&&n<5?1:0,"post-delay gain timing");
            near(yb[0],n>=3&&n<8?1:0,"pre-delay gain timing");
        }
    });
    check("parallel topology emits current and delayed contributions simultaneously",[&]{
        AllEngine e(48000);freeze(e,seed,0,0,1,1,1,0,0,7,7);
        for(int n=0;n<20;n++){auto y=e.tick(n==0?1:0,0,1,seed);near(y[0],n==0||n==7?.5:0,"parallel impulse");}
    });
    check("all three topologies can contribute in one frame",[&]{
        AllEngine e(48000);freeze(e,seed,.2,.3,.5,2,1,0,0,7,7);
        for(int n=0;n<20;n++){
            auto y=e.tick(n==0?1:0,0,1,seed);
            near(y[0],n==0?.5:(n==7?1.25:0),"simultaneous graph contributions");
        }
    });
    check("stereo matrix transfers a left-only input to the right output",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,0,0,0,1,1);
        auto y=e.tick(.75,0,1,seed);near(y[0],0,"cross matrix left");near(y[1],.75,"cross matrix right");
    });
    check("sample-wise signed gain changes are not forcibly smoothed",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,0);
        for(double g:std::array<double,7>{1,-1,4,0,-4,.125,-.5}){
            gain(e,seed,g,1);auto y=e.tick(.25,.5,1,seed);
            near(y[0],.25*g,"hard gain edge modified");near(y[1],.5,"independent right gain");
        }
    });
    check("each nonlinear family is zero-preserving and matches its direct mathematical definition",[&]{
        for(int k=0;k<=4;k++)for(double x:std::array<double,9>{-9,-1,-.3,-.001,0,.001,.3,1,9}){
            near(all_shape(x,k,2.25,7),shape(x,k,2.25,7),"nonlinearity mismatch");
            near(all_shape(0,k,2.25,7),0,"nonlinearity generated DC from zero");
        }
    });
    check("bounded feedback carries input history and cannot cause numeric runaway",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,0,4,4,0,0,1,1);e.all_scene0.hFeedback=.9;
        bool tail=false;
        for(int n=0;n<200000;n++){
            auto y=e.tick(n==0?1:0,0,1,seed);
            require(std::isfinite(y[0])&&std::abs(y[0])<=7.60000001,"unbounded feedback");
            if(n>10&&std::abs(y[0])>0)tail=true;
        }require(tail,"feedback did not carry history");
    });
    check("invalid inputs and controls cannot poison buffers or later frames",[&]{
        AllEngine e(48000);double nan=std::numeric_limits<double>::quiet_NaN(),inf=std::numeric_limits<double>::infinity();
        for(double bad:std::array<double,6>{nan,inf,-inf,1e300,-1e300,-1}){
            auto y=e.tick(bad,bad,bad,bad);require(std::isfinite(y[0])&&std::isfinite(y[1]),"nonfinite propagated");
        }
        for(int n=0;n<10000;n++){auto y=e.tick(.1,-.1,1,seed);require(std::isfinite(y[0])&&std::isfinite(y[1]),"poisoned history");}
    });
    check("sample-rate changes reconfigure clocks and stay inside fixed buffer bounds",[&]{
        AllEngine e(48000);
        for(double sr:std::array<double,7>{8000,44100,48000,88200,96000,192000,384000}){
            e.samplerate=sr;
            for(int n=0;n<30000;n++){
                auto y=e.tick(.2,-.1,.7,seed);const auto& t=e.trace;
                require(std::isfinite(y[0])&&std::isfinite(y[1]),"rate change nonfinite");
                require(t.dL>=0&&t.dL<=std::min(524287.,sr*2)&&t.dL==floor(t.dL),"rate delay bound");
            }
            near(e.all_motion0.hRate,sr,"motion clock stale");near(e.all_scene0.hRate,sr,"scene clock stale");
        }
    });
    check("instances are deterministic for a test seed and distinct for different seeds",[&]{
        AllEngine a(48000),b(48000),c(48000);int different=0;
        for(int n=0;n<100000;n++){
            auto ya=a.tick(.4,.2,1,seed),yb=b.tick(.4,.2,1,seed),yc=c.tick(.4,.2,1,seed+1);
            require(ya==yb,"same seed is not reproducible");if(ya!=yc)different++;
        }require(different>1000,"seeds share an output trajectory");
    });
    check("midstream seeding resets control streams without reallocating or clearing audio memory",[&]{
        AllEngine e(48000);auto* raw=e.allRaw.values.data();auto* pre=e.allPre.values.data();
        for(int n=0;n<100000;n++){
            double chosen=1+((n/97)*15485863LL)%2147483000;
            auto y=e.tick(.3,-.2,1,chosen);
            require(std::isfinite(y[0])&&std::isfinite(y[1]),"reseed nonfinite");
            near(e.all_motion0.hSeed,chosen,"motion reseed missed");near(e.all_scene0.hSeed,chosen,"scene reseed missed");
            near(e.hWrite,n+1,"reseed reset write position");near(e.hAvailable,n+1,"reseed cleared availability");
            require(raw==e.allRaw.values.data()&&pre==e.allPre.values.data(),"reseed reallocated memory");
        }
    });
    check("combined random arithmetic stays finite, open-range and nonconstant",[&]{
        double a=12345,b=67890,u=0,sum=0,lag=0,last=.5;
        for(int n=0;n<1000000;n++){
            std::tie(u,a,b)=all_random(a,b);require(u>0&&u<1&&std::isfinite(u),"random range");
            sum+=u;lag+=(u-.5)*(last-.5);last=u;
        }require(std::abs(sum/1000000-.5)<.003,"random mean sanity");require(std::abs(lag/1000000)<.001,"random lag sanity");
    });
    check("render exercises all motion and nonlinear families with bounded independent stereo state",[&]{
        AllEngine e(48000);std::set<int> shapes,nonlinear,stereo;bool burst=false,small=false,large=false,mixed=false,edge=false;
        double peak=0,previous=0;
        for(int n=0;n<3000000;n++){
            auto y=e.tick(.6*std::sin(n*.043),.4*std::cos(n*.071),1,seed+555);
            auto& t=e.trace;
            require(std::isfinite(y[0])&&std::isfinite(y[1]),"render nonfinite");
            require(std::abs(t.aLL)+std::abs(t.aLR)<=4.00000001,"left matrix bound");
            require(std::abs(t.aRR)+std::abs(t.aRL)<=4.00000001,"right matrix bound");
            near(t.wa+t.wb+t.wc,1,"routing sum",1e-8);
            require(t.dL>=0&&t.dR>=0&&t.dL<=96000&&t.dR<=96000,"render delay bounds");
            shapes.insert(int(e.all_motion0.hShape));nonlinear.insert(int(t.nonlinear));stereo.insert(int(t.stereo));
            burst|=e.all_motion0.hShape==5;small|=t.dL<=1;large|=t.dL>48000;
            mixed|=t.wa>.01&&t.wb>.01&&t.wc>.01;
            edge|=std::abs(t.aLL-previous)>1;previous=t.aLL;
            peak=std::max(peak,std::max(std::abs(y[0]),std::abs(y[1])));
        }
        require(shapes.size()==6&&nonlinear.size()==5&&stereo.size()==3,"missing random family");
        require(burst&&small&&large&&mixed&&edge,"missing short/long/hard/parallel state");
        require(peak>0.1&&peak<=6.0000001,"unexpected render level bound");
        std::cout<<"RENDER frames=3000000 seconds=62.5 peak="<<peak<<" shapes="<<shapes.size()<<" nonlinear="<<nonlinear.size()<<"\n";
    });
    std::cout<<"RESULT checks="<<checks<<" failed=0\n";return 0;
}catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}}
