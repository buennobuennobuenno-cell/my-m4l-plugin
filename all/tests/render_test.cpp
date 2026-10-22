// Executes statements translated from the shipped GenExpr, not a DSP rewrite.
#define ALL_TRACE 1
#include "all_model.hpp"
#include <deque>
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
    m.hMaximum=std::max(1.,floor(sr*12));m.hLimit=std::min(524287.,floor(sr*2));
}
void freeze(AllEngine& e,double seed,double gl=1,double gr=1,
            double pl=0,double pr=1,double dl=0,double dr=0){
    freeze_motion(e.all_motion0,seed,e.samplerate,gl);
    freeze_motion(e.all_motion1,seed,e.samplerate,gr);
    freeze_motion(e.all_motion2,seed,e.samplerate,pl);
    freeze_motion(e.all_motion3,seed,e.samplerate,pr);
    freeze_motion(e.all_motion4,seed,e.samplerate,dl);
    freeze_motion(e.all_motion5,seed,e.samplerate,dr);
}
int main(){try{
    constexpr double seed=1234567;
    check("five-second steady-tone render has no sustained broadband modulation",[&]{
        // Seed 3823 selected V2.0's sample-wise left delay noise for 11.64 seconds.
        // A sine obeys y[n]-2*cos(w)*y[n-1]+y[n-2]=0 at fixed delay/gain.
        // Slowly moving gain and occasional hard events cause small residuals;
        // randomized sample addresses instead produce a sustained large residual.
        AllEngine e(48000);constexpr int warm=96000,frames=240000;
        double omega=2*3.14159265358979323846*997/48000;
        double previous=0,previous2=0,energy=0,residual=0;
        for(int n=0;n<warm+frames;n++){
            double input=.5*std::sin(omega*n);
            auto y=e.tick(input,input,1,3823);
            double q=y[0]-2*std::cos(omega)*previous+previous2;
            if(n>=warm){energy+=y[0]*y[0];residual+=q*q;}
            previous2=previous;previous=y[0];
        }
        require(energy>1,"test tone missing");
        double ratio=residual/energy;
        std::cout<<"NOISE_REGRESSION seconds=5 residual_energy_ratio="<<ratio<<"\n";
        require(ratio<.01,"sustained broadband modulation of the input tone");
    });
    check("zero input remains exactly silent under running random processing",[&]{
        AllEngine e(8000);
        for(int n=0;n<1000000;n++){auto y=e.tick(0,0,1,seed);require(y[0]==0&&y[1]==0,"autonomous audio appeared");}
    });
    check("zero-delay identity and hard attenuation have exact sample values",[&]{
        AllEngine e(48000);
        for(double g:std::array<double,6>{1,0,.125,.5,1,0}){
            freeze(e,seed,g,g);
            auto y=e.tick(.8,-.4,1,seed);
            near(y[0],.8*g,"left attenuation");near(y[1],-.4*g,"right attenuation");
        }
    });
    check("Dry/Wet endpoints and all intermediate mixes match the same wet state",[&]{
        AllEngine dry(48000),wet(48000),mix(48000);
        for(int n=0;n<200000;n++){
            double l=.7*std::sin(n*.057),r=.5*std::cos(n*.031),m=(n%1001)/1000.;
            auto a=dry.tick(l,r,0,seed),b=wet.tick(l,r,1,seed),c=mix.tick(l,r,m,seed);
            require(a[0]==l&&a[1]==r,"dry input was altered");
            near(c[0],(1-m)*l+m*b[0],"left blend");near(c[1],(1-m)*r+m*b[1],"right blend");
        }
    });
    check("one-sample and independent integer stereo delays have exact impulse positions",[&]{
        AllEngine e(48000);freeze(e,seed,1,1,0,1,1,17);
        for(int n=0;n<40;n++){
            auto y=e.tick(n==0?1:0,n==0?.5:0,1,seed);
            near(y[0],n==1?1:0,"one sample impulse");near(y[1],n==17?.5:0,"right impulse");
        }
    });
    check("each output independently delays the same left-only input",[&]{
        AllEngine e(48000);freeze(e,seed,1,.5,0,0,5,17);
        for(int n=0;n<40;n++){
            auto y=e.tick(n==0?.75:0,0,1,seed);
            near(y[0],n==5?.75:0,"left-only to left");
            near(y[1],n==17?.375:0,"left-only to right");
        }
    });
    check("right-only input can be moved fully left without amplification",[&]{
        AllEngine e(48000);freeze(e,seed,1,0,1,1,7,0);
        for(int n=0;n<20;n++){
            auto y=e.tick(0,n==0?.8:0,1,seed);
            near(y[0],n==7?.8:0,"right-only to left");near(y[1],0,"muted right");
        }
    });
    check("merging correlated full-scale stereo never doubles the peak",[&]{
        AllEngine e(48000);
        for(double p:std::array<double,5>{0,.125,.5,.875,1}){
            freeze(e,seed,1,1,p,1-p);
            for(double x:std::array<double,4>{1,-1,.5,-.25}){
                auto y=e.tick(x,x,1,seed);near(y[0],x,"left sum boost");near(y[1],x,"right sum boost");
            }
        }
    });
    check("delayed amplitude is applied on read, not baked into the input history",[&]{
        AllEngine e(48000);freeze(e,seed,0,0,0,1,3,3);
        for(int n=0;n<8;n++){
            if(n==3){freeze_motion(e.all_motion0,seed,48000,1);freeze_motion(e.all_motion1,seed,48000,1);}
            auto y=e.tick(n==0?1:0,n==0?.5:0,1,seed);
            near(y[0],n==3?1:0,"stored input was attenuated");near(y[1],n==3?.5:0,"stored right input");
        }
    });
    check("ring wrap and maximum two-second delay preserve the original samples",[&]{
        AllEngine e(48000);freeze(e,seed,1,1,0,1,96000,1);
        for(int n=0;n<650000;n++){
            auto y=e.tick(n==0||n==524287?1:0,n==524288?1:0,1,seed);
            near(y[0],n==96000||n==620287?1:0,"maximum delay across wrap");
            near(y[1],n==524289?1:0,"one sample across wrap");
        }
    });
    check("unavailable history is silence instead of shortened delay or stale memory",[&]{
        AllEngine e(48000);freeze(e,seed,1,1,0,1,100,100);
        for(int n=0;n<100;n++){auto y=e.tick(.8,-.6,1,seed);near(y[0],0,"left pre-roll");near(y[1],0,"right pre-roll");}
        auto y=e.tick(0,0,1,seed);near(y[0],.8,"history arrival");near(y[1],-.6,"right history arrival");
    });
    check("no output survives beyond the finite input-history window",[&]{
        AllEngine e(8000);freeze(e,seed,1,1,0,0,16000,16000);
        for(int n=0;n<100000;n++){
            auto y=e.tick(n<1000?.8:0,0,1,seed);
            near(y[0],n>=16000&&n<17000?.8:0,"unexpected sustained tail");
            near(y[1],y[0],"same-input tail");
        }
        freeze(e,seed,1,1,0,0);
        for(int n=0;n<100000;n++){
            e.all_motion4.hWait=0;e.all_motion5.hWait=0;
            auto y=e.tick(0,0,1,seed);require(y[0]==0&&y[1]==0,"old sound reappeared");
        }
    });
    check("random output never exceeds the accessible input-history peak",[&]{
        AllEngine e(8000);std::deque<std::pair<int,double>> maxima;
        double peak=0;
        for(int n=0;n<1500000;n++){
            double scale=n<30000?1:(n<60000?.1:(n<90000?0:.35));
            double l=scale*std::sin(n*.043),r=scale*.75*std::cos(n*.071);
            double v=std::max(std::abs(l),std::abs(r));
            while(!maxima.empty()&&maxima.back().second<=v)maxima.pop_back();
            maxima.emplace_back(n,v);
            while(maxima.front().first<n-16000)maxima.pop_front();
            double m=(n%1001)/1000.;
            auto y=e.tick(l,r,m,seed);
            require(std::abs(y[0])<=maxima.front().second+1e-12,"left historical peak boost");
            require(std::abs(y[1])<=maxima.front().second+1e-12,"right historical peak boost");
            auto& t=e.trace;
            require(t.aLL>=0&&t.aLR>=0&&t.aRL>=0&&t.aRR>=0,"negative audio gain");
            require(t.aLL+t.aLR<=1+1e-12&&t.aRL+t.aRR<=1+1e-12,"matrix row amplifies");
            peak=std::max(peak,std::max(std::abs(y[0]),std::abs(y[1])));
        }
        std::cout<<"PEAK_BOUND frames=1500000 sample_rate=8000 peak="<<peak<<"\n";
    });
    check("all motion families stay in range with independent rapid stereo movement",[&]{
        AllEngine e(8000);std::set<int> shapes;
        bool leftRightDifferent=false;
        for(int n=0;n<2000000;n++){
            auto y=e.tick(.6*std::sin(n*.043),.4*std::cos(n*.071),1,seed+555);
            require(std::isfinite(y[0])&&std::isfinite(y[1]),"nonfinite render");
            for(auto* m:{&e.all_motion0,&e.all_motion1,&e.all_motion2,&e.all_motion3,&e.all_motion4,&e.all_motion5}){
                shapes.insert(int(m->hShape));
                require(m->hWait>=0&&m->hWait<96000,"event range");
            }
            auto& t=e.trace;
            require(t.dL>=0&&t.dR>=0&&t.dL<=16000&&t.dR<=16000,"delay range");
            require(t.dL==floor(t.dL)&&t.dR==floor(t.dR),"fractional audio address");
            leftRightDifferent|=t.dL!=t.dR&&t.gainL!=t.gainR;
        }
        require(shapes.size()==5&&leftRightDifferent,"missing motion diversity");
    });
    check("target endpoints and direct interval bins have no forced small-value weighting",[&]{
        near(all_target(0,0,96000),0,"gain zero");
        near(all_target(1-1e-12,0,96000),1,"gain one");
        near(all_target(0,1,96000),0,"delay zero");
        near(all_target(1-1e-12,1,96000),96000,"max delay");
        near(all_interval(0,576000),1,"one-sample interval");
        near(all_interval(1-1e-12,576000),576000,"max interval");
        for(int n=0;n<65536;n++)near(all_target((n+.5)/65536,0,96000),n/65535.,"gain bin");
        for(int n=0;n<96001;n++)near(all_target((n+.5)/96001,1,96000),n,"delay bin");
    });
    check("identical draws and targets are accepted without repeat rejection",[&]{
        AllMotion m;m.hSeed=seed;m.hRate=48000;m.hMaximum=576000;m.hLimit=96000;
        double a=100,b=1,u=0,target=0;
        for(int n=0;n<6;n++){std::tie(u,a,b)=all_random(a,b);if(n==0)require(u<1./5,"fixture must select hold");if(n==3)target=all_target(u,0,96000);}
        m.hValue=target;
        for(int n=0;n<100;n++){
            m.hWait=0;m.hA=100;m.hB=1;
            near(m.tick(seed,1,1,0,48000),target,"repeat changed");
            near(m.hA,a,"extra draw rejected repeat");near(m.hB,b,"extra second draw");
        }
    });
    check("random sanity and all five gain and pan modes have balanced selection bins",[&]{
        double a=12345,b=67890,u=0,sum=0,squares=0;
        std::array<int,16> bins{};
        for(int n=0;n<1000000;n++){
            std::tie(u,a,b)=all_random(a,b);require(u>0&&u<1,"random range");
            sum+=u;squares+=u*u;bins[int(u*16)]++;
        }
        require(std::abs(sum/1000000-.5)<.003,"random mean");
        require(std::abs(squares/1000000-1./3)<.003,"random second moment");
        for(int count:bins)require(std::abs(count-62500)<1800,"uneven target bins");
        AllMotion m;std::array<int,5> modes{};double waits=0,periods=0;
        for(int n=0;n<100000;n++){
            m.hWait=0;m.tick(seed,1,1,0,48000);
            require(m.hShape>=0&&m.hShape<5,"sample-wise noise mode selected");
            modes[int(m.hShape)]++;
            waits+=m.hWait+1;periods+=m.hPeriod;
        }
        for(int count:modes)require(std::abs(count-100000./5)<600,"uneven mode bins");
        require(std::abs(waits/100000/576000-.5)<.005,"duration weighting");
        require(std::abs(periods/100000/576000-.5)<.005,"transition weighting");
    });
    check("delay time stays fixed between events instead of resampling the input",[&]{
        for(int shape=0;shape<5;shape++){
            AllMotion m;freeze_motion(m,seed,48000,2400);
            m.hShape=shape;m.hFrom=0;m.hTo=2400;m.hPeriod=240000;m.hLimit=96000;
            double a=m.hA,b=m.hB;
            for(int n=0;n<240000;n++){
                near(m.tick(seed,5,0,1,48000),2400,"delay swept between events");
                near(m.hA,a,"per-sample first random draw");near(m.hB,b,"per-sample second random draw");
            }
        }
    });
    check("delay events keep a sample-rate-correct twenty millisecond minimum hold",[&]{
        for(double sr:std::array<double,5>{8000,44100,48000,96000,192000}){
            AllMotion m;
            for(int n=0;n<10000;n++){
                m.hWait=0;m.tick(seed,5,0,1,sr);
                require(m.hWait+1>=floor(sr*.02)&&m.hWait+1<=sr*12,"delay event rate");
                near(m.hShape,0,"delay is not held");
            }
        }
    });
    check("invalid inputs and controls cannot poison audio memory",[&]{
        AllEngine e(48000);double nan=std::numeric_limits<double>::quiet_NaN(),inf=std::numeric_limits<double>::infinity();
        for(double bad:std::array<double,5>{nan,inf,-inf,1e300,-1e300}){
            auto y=e.tick(bad,bad,bad,bad);require(y[0]==0&&y[1]==0,"invalid input leaked");
        }
        for(int n=0;n<10000;n++){auto y=e.tick(.1,-.1,.7,seed);require(std::isfinite(y[0])&&std::isfinite(y[1]),"poisoned history");}
    });
    check("sample-rate changes retire old history without clearing or reallocating",[&]{
        AllEngine e(48000);auto* data=e.allRaw.values.data();
        for(double sr:std::array<double,7>{8000,44100,48000,88200,96000,192000,384000}){
            e.samplerate=sr;e.tick(.2,-.1,1,seed);
            near(e.hWrite,1,"write clock not reset");near(e.hAvailable,1,"history not retired");
            for(int n=0;n<10000;n++){
                auto y=e.tick(.2,-.1,.7,seed);const auto& t=e.trace;
                require(std::isfinite(y[0])&&std::isfinite(y[1]),"rate change nonfinite");
                require(t.dL>=0&&t.dL<=std::min(524287.,sr*2)&&t.dL==floor(t.dL),"rate address");
            }
            near(e.all_motion0.hRate,sr,"motion stale");require(data==e.allRaw.values.data(),"reallocated");
        }
    });
    check("test seeds reproduce state while separate instance seeds differ",[&]{
        AllEngine a(8000),b(8000),c(8000);int different=0;
        for(int n=0;n<100000;n++){
            auto ya=a.tick(.4,.2,1,seed),yb=b.tick(.4,.2,1,seed),yc=c.tick(.4,.2,1,seed+1);
            require(ya==yb,"seed not reproducible");different+=ya!=yc;
        }require(different>1000,"instance streams identical");
    });
    check("re-seeding changes controls without resetting or reallocating audio history",[&]{
        AllEngine e(48000);auto* data=e.allRaw.values.data();
        for(int n=0;n<100000;n++){
            double chosen=1+((n/97)*15485863LL)%2147483000;
            auto y=e.tick(.3,-.2,1,chosen);
            require(std::isfinite(y[0])&&std::isfinite(y[1]),"reseed nonfinite");
            near(e.all_motion0.hSeed,chosen,"reseed missed");
            near(e.hWrite,n+1,"reseed write reset");near(e.hAvailable,n+1,"reseed lost history");
            require(data==e.allRaw.values.data(),"reseed reallocates");
        }
    });
    std::cout<<"RESULT checks="<<checks<<" failed=0\n";return 0;
}catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<"\n";return 1;}}
